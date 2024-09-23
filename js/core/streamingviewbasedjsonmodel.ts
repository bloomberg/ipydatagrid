import { PromiseDelegate } from '@lumino/coreutils';
import { DataModel } from '@lumino/datagrid';
import { StreamingView } from './streamingview';
import { TransformStateManager } from './transformStateManager';
import { ViewBasedJSONModel } from './viewbasedjsonmodel';
import { DataGridModel } from '../datagrid';
import { DataSource } from '../datasource';

interface IUnique {
  region: DataModel.CellRegion;
  column: string;
  values: any[];
}

/**
 * A view based data model implementation for in-memory JSON data.
 */
export class StreamingViewBasedJSONModel extends ViewBasedJSONModel {
  constructor(options: StreamingViewBasedJSONModel.IOptions) {
    super(options);
  }

  setModelRangeData(
    r1: number,
    r2: number,
    c1: number,
    c2: number,
    value: DataSource,
  ) {
    this._currentView.setDataRange(r1, r2, c1, c2, value);

    this.emitChanged({
      type: 'cells-changed',
      region: 'body',
      row: r1,
      column: c1,
      rowSpan: r2 - r1 + 1,
      columnSpan: c2 - c1 + 1,
    });

    this.emitChanged({
      type: 'cells-changed',
      region: 'row-header',
      row: r1,
      column: 0,
      rowSpan: r2 - r1 + 1,
      columnSpan: this._currentView.columnCount('row-header'),
    });
  }

  /**
   * Returns a Promise that resolves to an array of unique values contained in
   * the provided column index.
   *
   * @param region - The CellRegion to retrieve unique values for.
   * @param column - The column to retrieve unique values for.
   */
  uniqueValues(region: DataModel.CellRegion, column: string): Promise<any[]> {
    if (
      this._unique &&
      region == this._unique.region &&
      column == this._unique.column
    ) {
      return Promise.resolve(this._unique.values);
    }

    const promiseDelegate = new PromiseDelegate<any[]>();
    this._dataModel.on('msg:custom', (content) => {
      // when message received, want to drop this handler...
      // Or keep it going but need a way of identifying where to put the received data??????
      if (content.event_type === 'unique-values-reply') {
        this._unique = { region, column, values: content.values };
        promiseDelegate.resolve(this._unique.values);
      }

      // Do I need to cancel this callback?????????
    });

    const msg = { type: 'unique-values-request', column: column };
    this._dataModel.send(msg);

    return promiseDelegate.promise;
  }

  updateDataset(options: StreamingViewBasedJSONModel.IOptions): void {
    this._dataModel = options.dataModel;
    this._dataset = options.datasource;
    this._updatePrimaryKeyMap();
    const view = new StreamingView({
      datasource: this._dataset,
      rowCount: options.rowCount,
    });
    this.currentView = view;
  }

  updateCellValue(options: ViewBasedJSONModel.IUpdateCellValuesOptions): void {
    if (options.region != 'body') {
      return;
    }
    this._currentView.setData(options.value, options.row, options.column);
  }

  get currentView(): StreamingView {
    return this._currentView;
  }

  set currentView(view: StreamingView) {
    super.currentView = view;
  }

  /**
   * Handler for transformState.changed events.
   *
   * @param sender - TransformStateManager
   *
   * @param value - Event.
   */
  protected _transformStateChangedHandler(
    sender: TransformStateManager,
    value: TransformStateManager.IEvent,
  ) {
    this._transformSignal.emit(value);
  }

  protected _currentView: StreamingView;
  protected _dataModel: DataGridModel;
  protected _unique?: IUnique;
}

export namespace StreamingViewBasedJSONModel {
  /**
   * An options object for initializing the data model.
   */
  export interface IOptions extends ViewBasedJSONModel.IOptions {
    /**
     * The row number of the grid.
     */
    rowCount: number;

    dataModel: DataGridModel;
  }
}
