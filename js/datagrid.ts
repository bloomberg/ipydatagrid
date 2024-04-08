// Copyright (c) NumFOCUS.
// Distributed under the terms of the Modified BSD License.

import * as _ from 'underscore';

import { BasicSelectionModel, TextRenderer } from '@lumino/datagrid';

import { CellRenderer } from '@lumino/datagrid';

import { JSONExt } from '@lumino/coreutils';

import { Message, MessageLoop } from '@lumino/messaging';

import { Widget } from '@lumino/widgets';

import {
  Dict,
  DOMWidgetModel,
  DOMWidgetView,
  ICallbacks,
  ISerializers,
  // @ts-ignore needed for ipywidgetx 8.x compatibility
  JupyterLuminoPanelWidget,
  // @ts-ignore needed for ipywidgetx 7.x compatibility
  JupyterPhosphorPanelWidget,
  resolvePromisesDict,
  unpack_models,
  WidgetModel,
} from '@jupyter-widgets/base';

import { array_or_json_serializer } from 'bqplot';

import { ViewBasedJSONModel } from './core/viewbasedjsonmodel';
import { StreamingViewBasedJSONModel } from './core/streamingviewbasedjsonmodel';

import { MODULE_NAME, MODULE_VERSION } from './version';

import { CellRendererModel, CellRendererView } from './cellrenderer';
import { FeatherGrid } from './feathergrid';
import { StreamingFeatherGrid } from './streamingfeathergrid';
import { Theme } from './utils';
import { DataSource } from './datasource';

// Import CSS
import '../style/jupyter-widget.css';

function unpack_raw_data(
  value: any | Dict<unknown> | string | (Dict<unknown> | string)[],
): any {
  if (Array.isArray(value)) {
    const unpacked: any[] = [];
    value.forEach((sub_value, key) => {
      unpacked.push(unpack_raw_data(sub_value));
    });
    return unpacked;
  } else if (value instanceof Object && typeof value !== 'string') {
    const unpacked: { [key: string]: any } = {};
    Object.keys(value).forEach((key) => {
      unpacked[key] = unpack_raw_data(value[key]);
    });
    return unpacked;
  } else if (value === '$NaN$') {
    return Number.NaN;
  } else if (value === '$Infinity$') {
    return Number.POSITIVE_INFINITY;
  } else if (value === '$NegInfinity$') {
    return Number.NEGATIVE_INFINITY;
  } else if (value === '$NaT$') {
    return new Date('INVALID');
  } else {
    return value;
  }
}

function serialize_data(data: DataSource, manager: any): any {
  const serialized_data: any = {};
  for (const column of Object.keys(data.data)) {
    serialized_data[column] = array_or_json_serializer.serialize(
      data.data[column],
      manager,
    );
  }
  return { data: serialized_data, fields: data.fields, schema: data.schema };
}

function deserialize_data(data: any, manager: any): DataSource {
  const deserialized_data: any = {};

  // Backward compatibility for when data.data was an array of rows
  // (should be removed in ipydatagrid 2.x?)
  if (Array.isArray(data.data)) {
    if (data.data.length === 0) {
      return new DataSource(deserialized_data, data.fields, data.schema, true);
    }

    const unpacked = unpack_raw_data(data.data);
    // Turn array of rows (old approach) into a dictionary of columns as arrays (new approach)
    for (const column of Object.keys(unpacked[0])) {
      const columnData = new Array(unpacked.length);
      let rowIdx = 0;

      for (const row of unpacked) {
        columnData[rowIdx++] = row[column];
      }

      deserialized_data[column] = columnData;
    }

    return new DataSource(deserialized_data, data.fields, data.schema, true);
  }

  for (const column of Object.keys(data.data)) {
    deserialized_data[column] = [];

    if (Array.isArray(data.data[column])) {
      deserialized_data[column] = data.data[column];
      continue;
    }

    if (data.data[column].type == 'raw') {
      deserialized_data[column] = unpack_raw_data(data.data[column].value);
    } else {
      if (data.data[column].value.length !== 0) {
        let deserialized_array = array_or_json_serializer.deserialize(
          data.data[column],
          manager,
        );

        // Turning back float32 dates into isoformat
        if (deserialized_array.type === 'date') {
          const float32Array = deserialized_array;
          deserialized_array = [];

          for (let i = 0; i < float32Array.length; i++) {
            deserialized_array[i] = new Date(float32Array[i]).toISOString();
          }
        }

        deserialized_data[column] = deserialized_array;
      }
    }
  }
  return new DataSource(deserialized_data, data.fields, data.schema, true);
}

export class DataGridModel extends DOMWidgetModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_module: DataGridModel.model_module,
      _model_module_version: DataGridModel.model_module_version,
      _view_name: DataGridModel.view_name,
      _view_module: DataGridModel.view_module,
      _view_module_version: DataGridModel.view_module_version,
      _visible_rows: [],
      _transforms: [],
      baseRowSize: 20,
      baseColumnSize: 64,
      baseRowHeaderSize: 64,
      baseColumnHeaderSize: 20,
      headerVisibility: 'all',
      _data: {},
      renderers: {},
      corner_renderer: null,
      default_renderer: null,
      header_renderer: null,
      selection_mode: 'none',
      selections: [],
      grid_style: {},
      editable: false,
      column_widths: {},
      horizontal_stripes: false,
      vertical_stripes: false,
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);

    this.updateDataSync = this.updateDataSync.bind(this);
    this.syncTransformState = this.syncTransformState.bind(this);

    this.on('change:_data', this.updateData.bind(this));
    this.on('change:_transforms', this.updateTransforms.bind(this));
    this.on('change:selection_mode', this.updateSelectionModel, this);
    this.on('change:selections', this.updateSelections, this);
    this.updateData();
    this.updateTransforms();
    this.updateSelectionModel();

    this.on('msg:custom', (content) => {
      if (content.event_type === 'cell-changed') {
        this.data_model.setModelData(
          'body',
          content.row,
          content.column_index,
          content.value,
        );
      }

      if (content.event_type === 'row-changed') {
        this.data_model.setRowData(content.row, content.value);
      }
    });
  }

  updateDataSync(sender: any, msg: any) {
    switch (msg.type) {
      case 'row-indices-updated':
        this.set('_visible_rows', msg.indices);
        this.save_changes();
        break;
      case 'cell-edit-event':
        // Update data in widget model
        const newData = this.get('_data') as DataSource;
        newData.data[msg.column][msg.row] = msg.value;
        this.set('_data', newData);

        this.send(
          {
            event_type: 'cell-changed',
            region: msg.region,
            row: msg.row,
            column_index: msg.columnIndex,
            value: msg.value,
          },
          { ...this._view_callbacks },
        );
        break;
      default:
        throw 'unreachable';
    }
  }

  syncTransformState(sender: any, value: any) {
    this.set('_transforms', value.transforms);
    this.save_changes();
  }

  updateData() {
    const data = this.data;

    if (this.data_model) {
      this.data_model.updateDataset({ datasource: data });
      this.data_model.transformStateChanged.disconnect(this.syncTransformState);
      this.data_model.dataSync.disconnect(this.updateDataSync);
    }

    this.data_model = new ViewBasedJSONModel({ datasource: data });

    this.data_model.transformStateChanged.connect(this.syncTransformState);
    this.data_model.dataSync.connect(this.updateDataSync);

    this.updateTransforms();
    this.trigger('data-model-changed');
    this.updateSelectionModel();
  }

  updateTransforms() {
    if (this.selectionModel) {
      this.selectionModel.clear();
    }
    this.data_model.replaceTransforms(this.get('_transforms'));
  }

  updateSelectionModel() {
    if (this.selectionModel) {
      this.selectionModel.clear();
    }

    const selectionMode = this.get('selection_mode');

    if (selectionMode === 'none') {
      this.selectionModel = null;
      return;
    }

    this.selectionModel = new BasicSelectionModel({
      dataModel: this.data_model,
    });
    this.selectionModel.selectionMode = selectionMode;
    this.trigger('selection-model-changed');

    this.selectionModel.changed.connect(
      (sender: BasicSelectionModel, args: void) => {
        if (this.synchingWithKernel) {
          return;
        }

        this.synchingWithKernel = true;

        const selections: any[] = [];

        let selectionIter = sender.selections();
        // @ts-ignore
        if (typeof selectionIter.iter === 'function') {
          // Lumino 1 (JupyterLab 3)
          let selection = null;

          // @ts-ignore
          selectionIter = selectionIter.iter();

          while ((selection = selectionIter.next())) {
            selections.push({
              // @ts-ignore
              r1: Math.min(selection.r1, selection.r2),
              // @ts-ignore
              r2: Math.max(selection.r1, selection.r2),
              // @ts-ignore
              c1: Math.min(selection.c1, selection.c2),
              // @ts-ignore
              c2: Math.max(selection.c1, selection.c2),
            });
          }
        } else {
          // Lumino 2 (JupyterLab 4)
          let selectionNode = null;

          while ((selectionNode = selectionIter.next())) {
            if (selectionNode.done) {
              break;
            }

            const selection = selectionNode.value;

            selections.push({
              r1: Math.min(selection.r1, selection.r2),
              r2: Math.max(selection.r1, selection.r2),
              c1: Math.min(selection.c1, selection.c2),
              c2: Math.max(selection.c1, selection.c2),
            });
          }
        }

        this.set('selections', selections);
        this.save_changes();

        this.synchingWithKernel = false;
      },
      this,
    );
  }

  updateSelections() {
    if (!this.selectionModel || this.synchingWithKernel) {
      return;
    }

    this.synchingWithKernel = true;

    const selections = this.get('selections');
    this.selectionModel.clear();

    for (const selection of selections) {
      this.selectionModel.select({
        r1: selection.r1,
        c1: selection.c1,
        r2: selection.r2,
        c2: selection.c2,
        cursorRow: selection.r1,
        cursorColumn: selection.c1,
        clear: 'none',
      });
    }

    this.synchingWithKernel = false;
  }

  get data(): DataSource {
    return this.get('_data');
  }

  static serializers: ISerializers = {
    ...DOMWidgetModel.serializers,
    transforms: { deserialize: unpack_models as any },
    renderers: { deserialize: unpack_models as any },
    corner_renderer: { deserialize: unpack_models as any },
    default_renderer: { deserialize: unpack_models as any },
    header_renderer: { deserialize: unpack_models as any },
    _data: {
      deserialize: deserialize_data,
      serialize: serialize_data,
    },
    grid_style: { deserialize: unpack_style as any },
  };

  static readonly model_name: string = 'DataGridModel';
  static readonly model_module = MODULE_NAME;
  static readonly model_module_version = MODULE_VERSION;

  static readonly view_name: string = 'DataGridView';
  static readonly view_module = MODULE_NAME;
  static readonly view_module_version = MODULE_VERSION;

  data_model: ViewBasedJSONModel;
  selectionModel: BasicSelectionModel | null;
  synchingWithKernel = false;
  _view_callbacks: ICallbacks;
}

/**
 * Helper function to convert snake_case strings to camelCase.
 * Assumes all strings are valid snake_case (all lowercase).
 * @param string snake_case string
 * @returns camelCase string
 */
function camelCase(string: string): string {
  string = string.toLowerCase();
  const charArray = [];
  for (let i = 0; i < string.length; i++) {
    const curChar = string.charAt(i);
    if (curChar === '_') {
      i++;
      charArray.push(string.charAt(i).toUpperCase());
      continue;
    }
    charArray.push(curChar);
  }

  return charArray.join('');
}

/**
 * Custom deserialization function for grid styles.
 */
function unpack_style(
  value: any | Dict<unknown> | string | (Dict<unknown> | string)[],
  manager: any,
): Promise<WidgetModel | Dict<WidgetModel> | WidgetModel[] | any> {
  if (value instanceof Object && typeof value !== 'string') {
    const unpacked: { [key: string]: any } = {};
    Object.keys(value).forEach((key) => {
      unpacked[camelCase(key)] = unpack_style(value[key], manager);
    });
    return resolvePromisesDict(unpacked);
  } else if (typeof value === 'string' && value.slice(0, 10) === 'IPY_MODEL_') {
    return Promise.resolve(
      manager.get_model(value.slice(10, value.length)),
    ).then((model) => {
      // returning the color formatting function from VegaExprModel.
      return model._function;
    });
  } else {
    return Promise.resolve(value);
  }
}

export class DataGridView extends DOMWidgetView {
  _createElement(tagName: string) {
    const panelWidget = Private.getWidgetPanel();
    this.luminoWidget = new panelWidget({ view: this });
    this._initializeTheme();
    return this.luminoWidget.node;
  }

  // @ts-ignore Added for ipywidgets 7.x compatibility
  get pWidget(): any {
    return this.luminoWidget;
  }

  _setElement(el: HTMLElement) {
    if (this.el || el !== this.luminoWidget.node) {
      throw new Error('Cannot reset the DOM element.');
    }

    this.el = this.luminoWidget.node;
  }

  manageResizeEvent = () => {
    MessageLoop.postMessage(
      this.luminoWidget,
      Widget.ResizeMessage.UnknownSize,
    );
  };

  // ipywidgets 7 compatibility
  _processLuminoMessage(msg: Message, _super: any): void {
    _super.call(this, msg);

    switch (msg.type) {
      case 'after-show':
        if (this.luminoWidget.isVisible) {
          this.manageResizeEvent();
        }
        break;
    }
  }

  processLuminoMessage(msg: Message): void {
    // @ts-ignore needed for ipywidgets 8.x compatibility
    this._processLuminoMessage(msg, super.processLuminoMessage);
  }

  processPhosphorMessage(msg: Message): void {
    // @ts-ignore needed for ipywidgets 7.x compatibility
    this._processLuminoMessage(msg, super.processPhosphorMessage);
  }

  protected _createGrid(): FeatherGrid {
    return new FeatherGrid({
      defaultSizes: {
        rowHeight: this.model.get('base_row_size'),
        columnWidth: this.model.get('base_column_size'),
        rowHeaderWidth: this.model.get('base_row_header_size'),
        columnHeaderHeight: this.model.get('base_column_header_size'),
      },
      headerVisibility: this.model.get('header_visibility'),
      style: this.model.get('grid_style'),
    });
  }

  render(): Promise<void> {
    this.el.classList.add('datagrid-container');
    window.addEventListener('resize', this.manageResizeEvent);
    this.once('remove', () => {
      window.removeEventListener('resize', this.manageResizeEvent);
    });

    this.grid = this._createGrid();

    this.grid.columnWidths = this.model.get('column_widths');
    this.grid.editable = this.model.get('editable');
    // this.default_renderer must be created after setting grid.isLightTheme
    // for proper color variable initialization
    this.grid.isLightTheme = this._isLightTheme;
    this.grid.dataModel = this.model.data_model;
    this.grid.selectionModel = this.model.selectionModel;
    this.grid.backboneModel = this.model;

    this.grid.cellClicked.connect(
      (sender: FeatherGrid, event: FeatherGrid.ICellClickedEvent) => {
        if (this.model.comm) {
          this.send({
            event_type: 'cell-click',
            region: event.region,
            column: event.column,
            column_index: event.columnIndex,
            row: event.row,
            primary_key_row: event.primaryKeyRow,
            cell_value: event.cellValue,
          });
        }
      },
    );

    this.grid.columnsResized.connect(
      (sender: FeatherGrid, args: void): void => {
        this.model.set(
          'column_widths',
          JSONExt.deepCopy(this.grid.columnWidths),
        );
        this.model.save_changes();
      },
    );

    // Attaching the view's iopub callbacks functions to
    // the data model so we can use those as an
    // argument to model.send() function in the model class.
    this.model._view_callbacks = this.callbacks();

    this.model.on('data-model-changed', () => {
      this.grid.dataModel = this.model.data_model;
      this.handleColumnAutoFit();
    });

    this.model.on('change:base_row_size', () => {
      this.grid.baseRowSize = this.model.get('base_row_size');
    });

    this.model.on('change:base_column_size', () => {
      this.grid.baseColumnSize = this.model.get('base_column_size');
    });

    this.model.on('change:column_widths', () => {
      this.grid.columnWidths = this.model.get('column_widths');
    });

    this.model.on('change:base_row_header_size', () => {
      this.grid.baseRowHeaderSize = this.model.get('base_row_header_size');
    });

    this.model.on('change:base_column_header_size', () => {
      this.grid.baseColumnHeaderSize = this.model.get(
        'base_column_header_size',
      );
    });

    this.model.on('change:header_visibility', () => {
      this.grid.headerVisibility = this.model.get('header_visibility');
    });

    this.model.on_some_change(
      [
        'corner_renderer',
        'header_renderer',
        'default_renderer',
        'renderers',
        'grid_style',
      ],
      () => {
        this.updateRenderers()
          .then(this.updateGridStyle.bind(this))
          .then(this.updateGridRenderers.bind(this));
      },
      this,
    );

    this.model.on('selection-model-changed', () => {
      this.grid.selectionModel = this.model.selectionModel;
    });

    this.model.on('change:editable', () => {
      this.grid.editable = this.model.get('editable');
    });

    this.model.on_some_change(
      ['auto_fit_columns', 'auto_fit_params'],
      () => {
        this.handleColumnAutoFit();
      },
      this,
    );

    if (this.model.get('auto_fit_columns')) {
      this.handleColumnAutoFit();
    }

    return this.updateRenderers().then(() => {
      this.updateGridStyle();
      this.updateGridRenderers();
      this.luminoWidget.addWidget(this.grid);
    });
  }

  private handleColumnAutoFit() {
    // Check whether we need to auto-fit or revert to base size.
    const shouldAutoFit = this.model.get('auto_fit_columns');
    if (!shouldAutoFit) {
      this.grid.baseColumnSize = this.model.get('base_column_size');
      // Terminate call here if not auto-fitting.
      return;
    }

    // Retrieve user-defined auto-fit params
    let { area, padding, numCols } = this.model.get('auto_fit_params');

    // Data validation on params
    area = area ?? 'all';
    padding = padding ?? 30;
    numCols = numCols ?? undefined;

    // Call resize function
    this.grid.grid.fitColumnNames(area, padding, numCols);
  }

  private updateRenderers() {
    // Unlisten to previous renderers
    if (this.default_renderer) {
      this.stopListening(this.default_renderer, 'renderer-changed');
    }
    if (this.header_renderer) {
      this.stopListening(this.header_renderer, 'renderer-changed');
    }
    if (this.corner_renderer) {
      this.stopListening(this.corner_renderer, 'renderer-changed');
    }
    for (const key in this.renderers) {
      this.stopListening(this.renderers[key], 'renderer-changed');
    }

    // And create views for new renderers
    const promises = [];

    const default_renderer = this.model.get('default_renderer');
    promises.push(
      this.create_child_view(default_renderer).then(
        (defaultRendererView: any) => {
          this.default_renderer = defaultRendererView;

          this.listenTo(
            this.default_renderer,
            'renderer-changed',
            this.updateGridRenderers.bind(this),
          );
        },
      ),
    );

    const corner_renderer = this.model.get('corner_renderer');
    if (corner_renderer) {
      promises.push(
        this.create_child_view(corner_renderer).then(
          (cornerRendererView: any) => {
            this.corner_renderer = cornerRendererView;

            this.listenTo(
              this.corner_renderer,
              'renderer-changed',
              this.updateGridRenderers.bind(this),
            );
          },
        ),
      );
    }

    const header_renderer = this.model.get('header_renderer');
    if (header_renderer) {
      promises.push(
        this.create_child_view(header_renderer).then(
          (headerRendererView: any) => {
            this.header_renderer = headerRendererView;

            this.listenTo(
              this.header_renderer,
              'renderer-changed',
              this.updateGridRenderers.bind(this),
            );
          },
        ),
      );
    }

    const renderer_promises: Dict<Promise<any>> = {};
    _.each(
      this.model.get('renderers'),
      (model: CellRendererModel, key: string) => {
        renderer_promises[key] = this.create_child_view(model);
      },
    );
    promises.push(
      resolvePromisesDict(renderer_promises).then(
        (rendererViews: Dict<CellRendererView>) => {
          this.renderers = rendererViews;

          for (const key in rendererViews) {
            this.listenTo(
              rendererViews[key],
              'renderer-changed',
              this.updateGridRenderers.bind(this),
            );
          }
        },
      ),
    );

    return Promise.all(promises);
  }

  public updateGridStyle() {
    this.grid.updateGridStyle();
  }

  set isLightTheme(value: boolean) {
    this._isLightTheme = value;
    if (!this.grid) {
      return;
    }
    this.grid.isLightTheme = value;
  }

  get isLightTheme(): boolean {
    return this._isLightTheme;
  }

  private updateGridRenderers() {
    let defaultRenderer = this.default_renderer.renderer;
    if (
      this.grid.grid.style.backgroundColor !== Theme.getBackgroundColor() ||
      this.grid.grid.style.rowBackgroundColor ||
      this.grid.grid.style.columnBackgroundColor
    ) {
      // Making sure the default renderer doesn't paint over the global
      // grid background color, if the latter is set.
      defaultRenderer = new TextRenderer({
        ...this.default_renderer.renderer,
        backgroundColor: undefined,
      });
    }

    const hasHeaderRenderer = this.model.get('header_renderer') !== null;
    let columnHeaderRenderer = null;
    if (this.header_renderer && hasHeaderRenderer) {
      columnHeaderRenderer = this.header_renderer.renderer;
    } else {
      columnHeaderRenderer = new TextRenderer({
        font: '12px sans-serif',
        textColor: Theme.getFontColor(),
        backgroundColor: Theme.getBackgroundColor(2),
      });
    }

    let cornerHeaderRenderer = null;
    if (this.corner_renderer) {
      cornerHeaderRenderer = this.corner_renderer.renderer;
    }

    const renderers: Dict<CellRenderer> = {};
    Object.entries(this.renderers).forEach(([name, rendererView]) => {
      renderers[name] = rendererView.renderer;
    });

    this.grid.defaultRenderer = defaultRenderer;
    this.grid.columnHeaderRenderer = columnHeaderRenderer;

    if (cornerHeaderRenderer) {
      this.grid.cornerHeaderRenderer = cornerHeaderRenderer;
    }
    this.grid.renderers = renderers;
  }

  private _initializeTheme() {
    // initialize theme unless set earlier
    if (this._isLightTheme !== undefined) {
      return;
    }

    // initialize theme based on application settings
    this._isLightTheme = !(
      (
        document.body.classList.contains(
          'theme-dark',
        ) /* jupyter notebook or voila */ ||
        document.body.dataset.jpThemeLight === 'false'
      ) /* jupyter lab */
    );
  }

  renderers: Dict<CellRendererView>;
  corner_renderer: CellRendererView;
  default_renderer: CellRendererView;
  header_renderer: CellRendererView;
  grid: FeatherGrid;
  luminoWidget: JupyterLuminoPanelWidget;
  model: DataGridModel;
  backboneModel: DataGridModel;

  horizontal_stripes: boolean;
  vertical_stripes: boolean;

  // keep undefined since widget initializes before constructor
  private _isLightTheme: boolean;
}

export {
  BarRendererModel,
  BarRendererView,
  ImageRendererModel,
  ImageRendererView,
  HyperlinkRendererModel,
  HyperlinkRendererView,
  TextRendererModel,
  TextRendererView,
  HtmlRendererModel,
  HtmlRendererView,
} from './cellrenderer';
export { VegaExprModel, VegaExprView } from './vegaexpr';

export namespace DataGridModel {
  export interface IData {
    data: DataSource;
    schema: ISchema;
    fields: { [key: string]: null }[];
  }
  export interface IField {
    readonly name: string;
    readonly type: string;
    readonly rows: any[];
  }
  export interface ISchema {
    readonly fields: IField[];
    readonly primaryKey: string | string[];
    readonly primaryKeyUuid: string;
  }
}

/**
 * The namespace for the module implementation details.
 */
namespace Private {
  export function getWidgetPanel(): any {
    // @ts-ignore needed for ipywidget 7.x compatibility
    return JupyterLuminoPanelWidget ?? JupyterPhosphorPanelWidget;
  }
}

export class StreamingDataGridModel extends DataGridModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: StreamingDataGridModel.model_name,
      _view_name: StreamingDataGridModel.view_name,
      _row_count: 0,
      _data: {},
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);

    this.on('msg:custom', (content, buffers) => {
      if (content.event_type === 'data-reply') {
        // Bring back buffers at their original position in the data structure
        for (const column of Object.keys(content.value.data)) {
          content.value.data[column].value =
            buffers[content.value.data[column].value];
        }

        const deserialized = deserialize_data(content.value, null);
        this.data_model.setModelRangeData(
          content.r1,
          content.r2,
          content.c1,
          content.c2,
          deserialized,
        );
      }
    });
  }

  updateData() {
    const data = this.data;

    if (this.data_model) {
      this.data_model.updateDataset({
        datasource: data,
        rowCount: this.get('_row_count'),
      });
      this.data_model.transformStateChanged.disconnect(this.syncTransformState);
      this.data_model.dataSync.disconnect(this.updateDataSync);
    }

    this.data_model = new StreamingViewBasedJSONModel({
      datasource: this.data,
      rowCount: this.get('_row_count'),
    });

    this.data_model.transformStateChanged.connect(this.syncTransformState);
    this.data_model.dataSync.connect(this.updateDataSync);

    this.updateTransforms();
    this.trigger('data-model-changed');
    this.updateSelectionModel();
  }

  requestData(r1: number, r2: number, c1: number, c2: number) {
    this.send({ type: 'data-request', r1, r2, c1, c2 });
  }

  static readonly model_name: string = 'StreamingDataGridModel';
  static readonly view_name: string = 'StreamingDataGridView';

  data_model: StreamingViewBasedJSONModel;
}

export class StreamingDataGridView extends DataGridView {
  protected _createGrid(): StreamingFeatherGrid {
    return new StreamingFeatherGrid({
      defaultSizes: {
        rowHeight: this.model.get('base_row_size'),
        columnWidth: this.model.get('base_column_size'),
        rowHeaderWidth: this.model.get('base_row_header_size'),
        columnHeaderHeight: this.model.get('base_column_header_size'),
      },
      headerVisibility: this.model.get('header_visibility'),
      style: this.model.get('grid_style'),
      requestData: this.requestData.bind(this),
    });
  }

  private requestData(r1: number, r2: number, c1: number, c2: number) {
    this.model.requestData(r1, r2, c1, c2);
  }

  model: StreamingDataGridModel;
}
