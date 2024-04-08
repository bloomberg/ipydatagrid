import { CellGroup, DataModel, MutableDataModel } from '@lumino/datagrid';

import { ReadonlyJSONValue } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { Transform } from './transform';

import { View } from './view';

import { TransformStateManager } from './transformStateManager';

import { ArrayUtils } from '../utils';
import { DataSource } from '../datasource';

/**
 * A view based data model implementation for in-memory JSON data.
 */
export class ViewBasedJSONModel extends MutableDataModel {
  /**
   * Create a data model with static JSON data.
   *
   * @param options - The options for creating the data model.
   */
  constructor(options: ViewBasedJSONModel.IOptions) {
    super();
    this.updateDataset(options);

    this._transformState = new TransformStateManager();
    // Repaint grid on transform state update
    // Note: This will also result in the `model-reset` signal being sent.
    this._transformState.changed.connect((sender, value) => {
      this.currentView = this._transformState.createView(this._dataset);
      this._transformSignal.emit(value);
    });
    // first run: generate a list of indices corresponding
    // to the locations of multi-index arrays.
    const multiIndexArrayLocations =
      ArrayUtils.generateMultiIndexArrayLocations(this);
    // second run: map the index locations generated above to
    // the dataset so we have access to the multi index arrays
    // only.
    let mergedColumnLocations = ArrayUtils.generateColMergedCellLocations(
      this,
      multiIndexArrayLocations,
    );
    // final run: we need to check that the merging hierarchy makes sense. i.e. we don't
    // want to render a merged range below a non-merged range. This function will check
    // that this requirement is met. If it is not, we simply render each cell individually
    // as if it wasn't grouped.
    if (!ArrayUtils.validateMergingHierarchy(mergedColumnLocations)) {
      mergedColumnLocations = [];
    }
    this._mergedColumnCellLocations = mergedColumnLocations;

    // Creating column merged cell groups from index locations
    this._columnCellGroups = ArrayUtils.generateColumnCellGroups(
      this._mergedColumnCellLocations,
    );

    // Creating merged row cell groups
    let mergedRowLocations = ArrayUtils.generateRowMergedCellLocations(this);
    if (!ArrayUtils.validateMergingHierarchy(mergedRowLocations)) {
      mergedRowLocations = [];
    }
    this._mergedRowCellLocations = mergedRowLocations;
    this._rowCellGroups = ArrayUtils.generateRowCellGroups(
      this._mergedRowCellLocations,
    );
  }

  /**
   * Sets the dataset for this model.
   *
   * @param options - The options for creating the model
   */
  updateDataset(options: ViewBasedJSONModel.IOptions): void {
    this._dataset = options.datasource;
    this._updatePrimaryKeyMap();
    const view = new View(this._dataset);
    this.currentView = view;
  }

  /**
   * Updates the primary key map, which provides a mapping from primary key
   * value to row in the full dataset.
   */
  protected _updatePrimaryKeyMap(): void {
    this._primaryKeyMap.clear();

    const primaryKey = this._dataset.schema.primaryKey as string[];

    for (let idx = 0; idx < this._dataset.length; idx++) {
      const keys = primaryKey.map((key) => this._dataset.data[key][idx]);
      this._primaryKeyMap.set(JSON.stringify(keys), idx);
    }
  }

  areCellsMerged(cell1: number[], cell2: number[]): boolean {
    const [row2, col2] = cell2;

    const siblings = this.getMergedSiblingCells(cell1);

    for (const sibling of siblings) {
      if (row2 === sibling[0] && col2 === sibling[1]) {
        return true;
      }
    }

    return false;
  }
  /**
   * Returns a list of [row, column] cells indices forming a merged cell group
   * @param row row index
   * @param column column index
   */
  getMergedSiblingCells(cell: number[]): any[] {
    const [row, column] = cell;
    if (
      row < 0 ||
      column < 0 ||
      row >= this._mergedColumnCellLocations.length
    ) {
      return [];
    }

    for (const cellGroup of this._mergedColumnCellLocations[row]) {
      for (const rowCell of cellGroup) {
        const [rowIndex, columnIndex] = rowCell;
        if (row === rowIndex && column == columnIndex) {
          return cellGroup;
        }
      }
    }
    return [];
  }

  /**
   * Get the row count for a region in the data model.
   *
   * @param region - The row region of interest.
   *
   * @returns - The row count for the region.
   */
  rowCount(region: DataModel.RowRegion): number {
    return this.currentView.rowCount(region);
  }

  /**
   * Get the column count for a region in the data model.
   *
   * @param region - The column region of interest.
   *
   * @returns - The column count for the region.
   */
  columnCount(region: DataModel.ColumnRegion): number {
    return this.currentView.columnCount(region);
  }

  /**
   * Get the group count for each region
   * @param region
   * @returns
   */
  groupCount(region: DataModel.RowRegion): number {
    if (region === 'body') {
      return 0;
    } else if (region === 'column-header') {
      return this._columnCellGroups.length;
    } else if (region === 'row-header') {
      return this._rowCellGroups.length;
    }
    return 0;
  }

  /**
   * Specify merged cell groups for each region
   * @param region
   * @param groupIndex
   * @returns
   */
  group(region: DataModel.CellRegion, groupIndex: number): CellGroup | null {
    if (region === 'column-header') {
      return this._columnCellGroups[groupIndex];
    }

    if (region === 'row-header') {
      return this._rowCellGroups[groupIndex];
    }

    return null;
  }

  /**
   * Get the metadata for a cell in the data model.
   *
   * @param region - The cell region of interest.
   *
   * @param row - The index of the row of interest.
   *
   * @param column - The index of the column of interest.
   *
   * @returns The metadata for the cell.
   */
  metadata(
    region: DataModel.CellRegion,
    row: number,
    column: number,
  ): DataModel.Metadata {
    const md = this.currentView.metadata(region, row, column);
    if (region == 'body') {
      md.row = row;
      md.column = column;
      md.data = (row: number, column: string) => {
        const columnIndex = this.columnNameToIndex(column.toString());
        return this.data('body', row, columnIndex);
      };
    }
    return md;
  }

  /**
   * Get the data value for a cell in the data model.
   *
   * @param region - The cell region of interest.
   *
   * @param row - The row index of the cell of interest.
   *
   * @param column - The column index of the cell of interest.
   *
   * @param returns - The data value for the specified cell.
   */
  data(region: DataModel.CellRegion, row: number, column: number): any {
    return this.currentView.data(region, row, column);
  }

  /**
   * Updates the cell value of the currently displayed View.
   *
   * @param region - The cell region of interest.
   *
   * @param row - The row index of the cell of interest.
   *
   * @param column - The column index of the cell of interest.
   *
   * @param value - The new value to update the indicated cell with.
   *
   */
  setData(
    region: DataModel.CellRegion,
    row: number,
    column: number,
    value: any,
  ): boolean {
    const datasetRow = this.getDatasetRowFromView(region, row);
    this.updateCellValue({
      region: region,
      row: datasetRow,
      column: column,
      value: value,
    });
    this.emitChanged({
      type: 'cells-changed',
      region: region,
      row: row,
      column: column,
      rowSpan: 1,
      columnSpan: 1,
    });

    return true;
  }

  /**
   * Updates the cell value of the currently displayed View.
   *
   * @param region - The cell region of interest.
   *
   * @param row - The row index of the cell of interest.
   *
   * @param column - The column index of the cell of interest.
   *
   * @param value - The new value to update the indicated cell with.
   *
   */
  setModelData(
    region: DataModel.CellRegion,
    row: number,
    column: number,
    value: any,
  ): boolean {
    this.updateCellValue({
      region: region,
      row: row,
      column: column,
      value: value,
    });
    this.emitChanged({
      type: 'cells-changed',
      region: region,
      row: row,
      column: column,
      rowSpan: 1,
      columnSpan: 1,
    });

    return true;
  }

  /**
   * Updates the row value of the currently displayed View.
   *
   * @param row - The row index of the cell of interest.
   *
   * @param value - The new value to update the indicated row with.
   *
   */
  setRowData(row: number, value: any): boolean {
    this.updateRowValue({
      row: row,
      value: value,
    });
    this.emitChanged({
      type: 'cells-changed',
      region: 'body',
      row,
      column: 0,
      rowSpan: 1,
      columnSpan: 1,
    });

    return true;
  }

  public columnNameToIndex(name: string): number {
    const schema = this.dataset.schema;
    const primaryKeysLength = schema.primaryKey.length - 1;

    let index = -1;

    if (schema.primaryKey.includes(name)) {
      index = schema.primaryKey.indexOf(name);
    } else {
      const fields = schema.fields;

      fields.forEach((value, i) => {
        if (value.name == name) {
          index = i - primaryKeysLength;
        }
      });
    }
    return index;
  }

  public columnIndexToName(
    index: number,
    region: DataModel.ColumnRegion,
  ): string {
    const schema = this.dataset.schema;
    if (region == 'row-header') {
      return schema.primaryKey[index];
    } else {
      return schema.fields[schema.primaryKey.length + index - 1].name;
    }
  }

  public columnNameToRegion(name: string): DataModel.ColumnRegion {
    const schema = this.dataset.schema;

    if (schema.primaryKey.includes(name)) {
      return 'row-header';
    } else {
      return 'body';
    }
  }

  /**
   * Get the current View for the model.
   */
  get currentView(): View {
    return this._currentView;
  }

  /**
   * Sets the provided View as the current View, then emits a changed signal.
   */
  set currentView(view: View) {
    this._currentView = view;

    this.emitChanged({ type: 'model-reset' });

    const primaryKey = !Array.isArray(this._dataset.schema.primaryKey)
      ? [this._dataset.schema.primaryKey]
      : this._dataset.schema.primaryKey;

    const indices: number[] = [];

    for (let idx = 0; idx < view.dataset.length; idx++) {
      const lookupVal = JSON.stringify(
        primaryKey.map((key) => view.dataset.data[key][idx]),
      );
      const retrievedVal = this._primaryKeyMap.get(lookupVal);

      indices.push(typeof retrievedVal === 'undefined' ? idx : retrievedVal);
    }

    this.dataSync.emit({
      type: 'row-indices-updated',
      indices: indices,
    });
  }

  /**
   * Add a new transform to the currently active transforms.
   *
   * @param transform - The transform to be added.
   */
  addTransform(transform: Transform.TransformSpec): void {
    this._transformState.add(transform);
  }

  /**
   * Removes the provided transformation from the active state.
   *
   * @param column - The column state to be removed.
   *
   * @param transformType - The type of the transform to be removed from state.
   */
  removeTransform(column: string, transformType: string): void {
    this._transformState.remove(column, transformType);
  }

  /**
   * Apply an array of transformations to the dataset and update the current
   * View. The provided transforms will replace any existing ones.
   *
   * @param transforms - Array of transformations to apply to the dataset
   */
  replaceTransforms(transforms: Transform.TransformSpec[]): void {
    this._transformState.replace(transforms);
  }

  /**
   * Removes all active transforms.
   */
  clearTransforms(): void {
    this._transformState.clear();
  }

  /**
   * Returns the transform metadata for the provided column.
   *
   * @param column - The column of the metadata to be retrieved.
   */
  transformMetadata(column: string): TransformStateManager.IColumn | undefined {
    return this._transformState.metadata(column);
  }

  /**
   * Returns a Promise that resolves to an array of unique values contained in
   * the provided column index.
   *
   * @param region - The CellRegion to retrieve unique values for.
   * @param column - The column to retrieve unique values for.
   */
  uniqueValues(region: DataModel.CellRegion, column: string): any[] {
    return Array.from(new Set(this.dataset.data[column]));
  }

  /**
   * Returns a Promise that resolves to an array of unique values contained in
   * the provided column index after all transforms have been applied.
   *
   * @param region - The CellRegion to retrieve unique values for.
   * @param column - The column to retrieve unique values for.
   */
  async uniqueValuesVisible(
    region: DataModel.CellRegion,
    column: string,
  ): Promise<any[]> {
    return this._currentView.uniqueValues(region, column);
  }

  get transformStateChanged(): ISignal<this, TransformStateManager.IEvent> {
    return this._transformSignal;
  }

  /**
   * Returns the active transforms for the current model
   */
  get activeTransforms(): Transform.TransformSpec[] {
    return this._transformState.activeTransforms;
  }

  getFilterTransform(column: string): Transform.TransformSpec | undefined {
    return this._transformState.getFilterTransform(column);
  }

  /**
   * Updates the indicated value in the dataset.
   *
   * Note: provided row/column values should correspond to the currently
   * active View, not the full dataset.
   * Note: Currently, only updating `body` cells is supported.
   *
   * @param options - The options for this method.
   */
  getDatasetRowFromView(region: DataModel.CellRegion, row: number): number {
    if (region == 'column-header' || region == 'corner-header') {
      return row;
    }
    // Get the index of the row in the full dataset to be updated
    const primaryKey = Array.isArray(this._dataset.schema.primaryKey)
      ? this._dataset.schema.primaryKey
      : [this._dataset.schema.primaryKey];

    const keyValues = primaryKey.map(
      (key) => this._currentView.dataset.data[key][row],
    );

    const lookupIndex: number = this._primaryKeyMap.get(
      JSON.stringify(keyValues),
    )!;

    return lookupIndex;
  }

  /**
   * Updates a value in the full dataset of the model.
   *
   * @param options - The options for this function.
   */
  updateCellValue(options: ViewBasedJSONModel.IUpdateCellValuesOptions): void {
    // Bail if cell region isn't the body
    // TODO: Support modifying the schema
    if (options.region !== 'body') {
      return;
    }
    const columnName = this.metadata('body', 0, options.column)['name'];
    this._dataset.data[columnName][options.row] = options.value;

    // Notify listeners of the cell change event
    this.dataSync.emit({
      type: 'cell-edit-event',
      column: columnName,
      columnIndex: options.column,
      row: options.row,
      region: options.region,
      value: options.value,
    });
    // We need to rerun the transforms, as the changed cell may change the order
    // or visibility of other rows
    this.currentView = this._transformState.createView(this._dataset);
  }

  /**
   * Updates a row in the full dataset of the model.
   *
   * @param options - The options for this function.
   */
  updateRowValue(options: ViewBasedJSONModel.IUpdateRowValuesOptions): void {
    // Create new row and add it to new dataset
    for (const columnIndex of Array(options.value.length).keys()) {
      const columnName = this.metadata('body', 0, columnIndex)['name'];
      this._dataset.data[columnName][options.row] = options.value[columnIndex];
    }
    // We need to rerun the transforms, as the changed cells may change the order
    // or visibility of other rows
    this.currentView = this._transformState.createView(this._dataset);
  }

  /**
   * A signal emitted when the data model has changes to sync to the kernel.
   */
  get dataSync(): Signal<this, ViewBasedJSONModel.IDataSyncEvent> {
    return this._dataSyncSignal;
  }

  /**
   * Returns the current full dataset.
   */
  get dataset(): DataSource {
    return this._dataset;
  }

  /**
   * Returns the index in the schema that relates to the index by region.
   *
   * @param region - The `CellRegion` of interest.
   *
   * @param index - The column index to look up.
   */
  getSchemaIndex(region: DataModel.CellRegion, index: number): number {
    return this.currentView.getSchemaIndex(region, index);
  }

  protected _currentView: View;
  private _transformSignal = new Signal<this, TransformStateManager.IEvent>(
    this,
  );
  private _dataSyncSignal = new Signal<this, ViewBasedJSONModel.IDataSyncEvent>(
    this,
  );
  private _primaryKeyMap: Map<ReadonlyJSONValue, number> = new Map();

  protected _dataset: DataSource;
  protected readonly _transformState: TransformStateManager;
  private _mergedColumnCellLocations: any[];
  private _mergedRowCellLocations: any[];
  private _rowCellGroups: CellGroup[];
  private _columnCellGroups: CellGroup[];
}

/**
 * The namespace for the `ViewBasedJSONModel` class statics.
 */
export namespace ViewBasedJSONModel {
  export interface IOptions {
    /**
     * The `DataSource` for the model.
     */
    datasource: DataSource;
  }

  export interface IUpdateCellValuesOptions {
    /**
     * The `CellRegion` of the cell to be updated.
     */
    region: DataModel.CellRegion;

    /**
     * The index of the target row in the current view.
     */
    column: number;

    /**
     * The index of the target row in the current view.
     */
    row: number;

    /**
     * The new value to replace the old one.
     */
    value: any;
  }

  export interface IUpdateRowValuesOptions {
    /**
     * The index of the target row in the current view.
     */
    row: number;

    /**
     * The new value to replace the old one.
     */
    value: any[];
  }

  export type IDataSyncEvent = ISyncRowIndices | ICellEditEvent;

  export interface ISyncRowIndices {
    /**
     * The discriminated type of the args object.
     */
    type: 'row-indices-updated';

    /**
     * An list of the rows in the untransformed dataset that are currently
     * represented in the `View`.
     */
    indices: number[];
  }

  export interface ICellEditEvent {
    /**
     * The discriminated type of the args object.
     */
    type: 'cell-edit-event';

    /**
     * The CellRegion associated with this change.
     */
    region: DataModel.CellRegion;

    /**
     * The row number associated with this change.
     */
    row: number;

    /**
     * The column name associated with this change.
     */
    column: string;

    /**
     * TODO Deprecate this
     * The column index associated with this change.
     */
    columnIndex: number;

    /**
     * The new data value
     */
    value: ReadonlyJSONValue;
  }
}
