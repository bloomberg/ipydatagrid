// Copyright (c) QuantStack
// Distributed under the terms of the Modified BSD License.

import * as _ from 'underscore';

import {
  TextRenderer
} from '@phosphor/datagrid';

import {
  toArray
} from '@phosphor/algorithm';

import {
  CommandRegistry
} from '@phosphor/commands';

import {
  BasicKeyHandler, DataModel
} from '@phosphor/datagrid';

import {
  BasicMouseHandler, BasicSelectionModel, CellRenderer, DataGrid
} from '@phosphor/datagrid';

import {
  DOMWidgetModel, DOMWidgetView, JupyterPhosphorPanelWidget, ISerializers, resolvePromisesDict, unpack_models
} from '@jupyter-widgets/base';

import {
  ViewBasedJSONModel
} from './core/viewbasedjsonmodel'

import {
  IPyDataGridContextMenu
} from './core/gridContextMenu';

import {
  InteractiveFilterDialog
} from './core/filterMenu';

import {
  HeaderRenderer
} from './core/headerRenderer';

// Import CSS
import '../css/datagrid.css'

import {
  MODULE_NAME, MODULE_VERSION
} from './version';

import {
  CellRendererModel, CellRendererView
} from './cellrenderer'

import {
  Theme
} from './utils'

// Shorthand for a string->T mapping
type Dict<T> = { [keys: string]: T; };

class IIPyDataGridMouseHandler extends BasicMouseHandler {
  /**
   * Construct a new datagrid mouse handler.
   *
   * @param dataGridView - The DataGridView object for which mouse events are handled.
   */
  constructor(dataGridView: DataGridView) {
    super();

    this._dataGridView = dataGridView;
  }

  /**
   * Handle the mouse down event for the data grid.
   *
   * @param grid - The data grid of interest.
   *
   * @param event - The mouse down event of interest.
   */
  onMouseDown(grid: DataGrid, event: MouseEvent): void {
    const hit = grid.hitTest(event.clientX, event.clientY);
    const hitRegion = hit.region;
    const buttonSize = HeaderRenderer.buttonSize;
    const buttonPadding = HeaderRenderer.buttonPadding;

    if (hitRegion === 'corner-header' || hitRegion === 'column-header') {
      const columnWidth = grid.columnSize(
        hitRegion === 'corner-header' ? 'row-header' : 'body', hit.column);
      const rowHeight = grid.rowSize('column-header', hit.row);
      const isMenuClick =
        hit.x > (columnWidth - buttonSize - buttonPadding) &&
        hit.x < (columnWidth - buttonPadding) &&
        hit.y > (rowHeight - buttonSize - buttonPadding) &&
        hit.y < (rowHeight - buttonPadding);

      if (isMenuClick) {
        this._dataGridView.contextMenu.open(grid, {
          ...hit, x: event.clientX, y: event.clientY
        });

        return;
      }
    }

    super.onMouseDown(grid, event);
  }

  private _dataGridView: DataGridView;
};


export
  class DataGridModel extends DOMWidgetModel {
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
      data: {},
      renderers: {},
      default_renderer: null,
      selection_mode: 'none',
      selections: []
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);

    this.on('change:data', this.updateData.bind(this));
    this.on('change:_transforms', this.updateTransforms.bind(this));
    this.on('change:selection_mode', this.updateSelectionModel, this);
    this.on('change:selections', this.updateSelections, this);
    this.updateData();
    this.updateTransforms();
    this.updateSelectionModel();
  }

  updateData() {
    this.data_model = new ViewBasedJSONModel(this.get('data'));
    this.data_model = new ViewBasedJSONModel(this.get('data'));
    this.data_model.transformStateChanged.connect((sender, value) => {
      this.set('_transforms', value.transforms);
      this.save_changes();
    });
    this.data_model.dataSync.connect((sender, msg) => {
      switch (msg.type) {
        case ('row-indices-updated'):
          this.set('_visible_rows', msg.indices);
          this.save_changes();
          break;
        case ('cell-updated'):
          this.set('data', this.data_model.dataset);
          this.save_changes();
          break;
        default:
          throw 'unreachable';
      }
    })

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

    this.selectionModel = new BasicSelectionModel({ dataModel: this.data_model });
    this.selectionModel.selectionMode = selectionMode;
    this.trigger('selection-model-changed');

    this.selectionModel.changed.connect((sender: BasicSelectionModel, args: void) => {
      if (this.synchingWithKernel) {
        return;
      }

      this.synchingWithKernel = true;

      const selectionIter = sender.selections().iter();
      const selections: any[] = [];
      let selection = null;
      while (selection = selectionIter.next()) {
        selections.push({
          r1: Math.min(selection.r1, selection.r2),
          r2: Math.max(selection.r1, selection.r2),
          c1: Math.min(selection.c1, selection.c2),
          c2: Math.max(selection.c1, selection.c2),
        });
      }

      this.set('selections', selections);
      this.save_changes();

      this.synchingWithKernel = false;
    }, this);
  }

  updateSelections() {
    if (!this.selectionModel || this.synchingWithKernel) {
      return;
    }

    this.synchingWithKernel = true;

    const selections = this.get('selections');
    this.selectionModel.clear();

    for (let selection of selections) {
      this.selectionModel.select({
        r1: selection.r1,
        c1: selection.c1,
        r2: selection.r2,
        c2: selection.c2,
        cursorRow: selection.r1,
        cursorColumn: selection.c1,
        clear: "none"
      });
    }

    this.synchingWithKernel = false;
  }

  static serializers: ISerializers = {
    ...DOMWidgetModel.serializers,
    transforms: { deserialize: (unpack_models as any) },
    renderers: { deserialize: (unpack_models as any) },
    default_renderer: { deserialize: (unpack_models as any) },
  }

  static model_name = 'DataGridModel';
  static model_module = MODULE_NAME;
  static model_module_version = MODULE_VERSION;

  static view_name = 'DataGridView';
  static view_module = MODULE_NAME;
  static view_module_version = MODULE_VERSION;

  data_model: ViewBasedJSONModel;
  selectionModel: BasicSelectionModel | null;
  synchingWithKernel: boolean = false;
}


export
  class DataGridView extends DOMWidgetView {
  _createElement(tagName: string) {
    this.pWidget = new JupyterPhosphorPanelWidget({ view: this });
    return this.pWidget.node;
  }

  _setElement(el: HTMLElement) {
    if (this.el || el !== this.pWidget.node) {
      throw new Error('Cannot reset the DOM element.');
    }

    this.el = this.pWidget.node;
  }

  copyToClipboard(): void {
    const grid = <DataGrid><unknown>this;
    // Fetch the data model.
    let dataModel = grid.dataModel;

    // Bail early if there is no data model.
    if (!dataModel) {
      return;
    }

    // Fetch the selection model.
    let selectionModel = grid.selectionModel;

    // Bail early if there is no selection model.
    if (!selectionModel) {
      return;
    }

    // Coerce the selections to an array.
    let selections = toArray(selectionModel.selections());

    // Bail early if there are no selections.
    if (selections.length === 0) {
      return;
    }

    // Alert that multiple selections cannot be copied.
    if (selections.length > 1) {
      alert('Cannot copy multiple grid selections.');
      return;
    }

    // Fetch the model counts.
    let br = dataModel.rowCount('body');
    let bc = dataModel.columnCount('body');

    // Bail early if there is nothing to copy.
    if (br === 0 || bc === 0) {
      return;
    }

    // Unpack the selection.
    let { r1, c1, r2, c2 } = selections[0];

    // Clamp the selection to the model bounds.
    r1 = Math.max(0, Math.min(r1, br - 1));
    c1 = Math.max(0, Math.min(c1, bc - 1));
    r2 = Math.max(0, Math.min(r2, br - 1));
    c2 = Math.max(0, Math.min(c2, bc - 1));

    // Ensure the limits are well-orderd.
    if (r2 < r1) [r1, r2] = [r2, r1];
    if (c2 < c1) [c1, c2] = [c2, c1];

    // Fetch the header counts.
    let rhc = dataModel.columnCount('row-header');
    let chr = dataModel.rowCount('column-header');

    // Unpack the copy config.
    let separator = grid.copyConfig.separator;
    let format = grid.copyConfig.format;
    let headers = grid.copyConfig.headers;
    let warningThreshold = grid.copyConfig.warningThreshold;

    // Compute the number of cells to be copied.
    let rowCount = r2 - r1 + 1;
    let colCount = c2 - c1 + 1;
    switch (headers) {
      case 'none':
        rhc = 0;
        chr = 0;
        break;
      case 'row':
        chr = 0;
        colCount += rhc;
        break;
      case 'column':
        rhc = 0;
        rowCount += chr;
        break;
      case 'all':
        rowCount += chr;
        colCount += rhc;
        break;
      default:
        throw 'unreachable';
    }

    // Compute the total cell count.
    let cellCount = rowCount * colCount;

    // Allow the user to cancel a large copy request.
    if (cellCount > warningThreshold) {
      let msg = `Copying ${cellCount} cells may take a while. Continue?`;
      if (!window.confirm(msg)) {
        return;
      }
    }

    // Set up the format args.
    let args = {
      region: 'body' as DataModel.CellRegion,
      row: 0,
      column: 0,
      value: null as any,
      metadata: {} as DataModel.Metadata
    };

    // Allocate the array of rows.
    let rows = new Array<string[]>(rowCount);

    // Iterate over the rows.
    for (let j = 0; j < rowCount; ++j) {
      // Allocate the array of cells.
      let cells = new Array<string>(colCount);

      // Iterate over the columns.
      for (let i = 0; i < colCount; ++i) {
        // Set up the format variables.
        let region: DataModel.CellRegion;
        let row: number;
        let column: number;

        // Populate the format variables.
        if (j < chr && i < rhc) {
          region = 'corner-header';
          row = j;
          column = i;
        } else if (j < chr) {
          region = 'column-header';
          row = j;
          column = i - rhc + c1;
        } else if (i < rhc) {
          region = 'row-header';
          row = j - chr + r1;
          column = i;
        } else {
          region = 'body';
          row = j - chr + r1;
          column = i - rhc + c1;
        }

        // Populate the format args.
        args.region = region;
        args.row = row;
        args.column = column;
        args.value = dataModel.data(region, row, column);
        args.metadata = dataModel.metadata(region, row, column);

        // Format the cell.
        cells[i] = format(args);
      }

      // Save the row of cells.
      rows[j] = cells;
    }

    // Convert the cells into lines.
    let lines = rows.map(cells => cells.join(separator));

    // Convert the lines into text.
    let text = lines.join('\n');

    // Copy the text to the clipboard.
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;

    // Text area has to be visible on page for copy without Clipboard API,
    // So we create an "invisible" element, add it to the body, then remove
    // when no longer needed.

    textArea.style.height = '0px';
    textArea.style.width = '0px';
    textArea.style.overflow = 'hidden';
    textArea.id = 'ipydatagrid-textarea'
    textArea.style.position = 'absolute';
    document.body.appendChild(textArea)
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }

  render() {
    this.el.classList.add('datagrid-container');

    return this.updateRenderers().then(() => {
      this.grid = new DataGrid({
        defaultSizes: {
          rowHeight: this.model.get('base_row_size'),
          columnWidth: this.model.get('base_column_size'),
          rowHeaderWidth: this.model.get('base_row_header_size'),
          columnHeaderHeight: this.model.get('base_column_header_size')
        },
        headerVisibility: this.model.get('header_visibility'),
      });

      // Replace method of copying to clipboard with one that allows
      // a ClipboardEvent to reach document.body
      this.grid.copyToClipboard = this.copyToClipboard.bind(this.grid)

      this.filterDialog = new InteractiveFilterDialog({
        model: this.model.data_model
      });

      this.contextMenu = new IPyDataGridContextMenu({
        grid: this.grid,
        commands: this._createCommandRegistry()
      });

      this.updateGridStyle();

      this.grid.dataModel = this.model.data_model;
      this.grid.keyHandler = new BasicKeyHandler();
      this.grid.mouseHandler = new IIPyDataGridMouseHandler(this);
      this.grid.selectionModel = this.model.selectionModel;
      this.updateGridRenderers();

      this.model.on('data-model-changed', () => {
        this.grid.dataModel = this.model.data_model;
        this.updateHeaderRenderer();
        this.filterDialog.model = this.model.data_model;
      });

      this.model.on('change:base_row_size', () => {
        this.grid.defaultSizes = {
          ...this.grid.defaultSizes,
          rowHeight: this.model.get('base_row_size')
        };
      });

      this.model.on('change:base_column_size', () => {
        this.grid.defaultSizes = {
          ...this.grid.defaultSizes,
          columnWidth: this.model.get('base_column_size')
        };
      });

      this.model.on('change:base_row_header_size', () => {
        this.grid.defaultSizes = {
          ...this.grid.defaultSizes,
          rowHeaderWidth: this.model.get('base_row_header_size')
        };
      });

      this.model.on('change:base_column_header_size', () => {
        this.grid.defaultSizes = {
          ...this.grid.defaultSizes,
          columnHeaderHeight: this.model.get('base_column_header_size')
        };
      });

      this.model.on('change:header_visibility', () => {
        this.grid.headerVisibility = this.model.get('header_visibility');
      });

      this.model.on_some_change(['default_renderer', 'renderers'], () => {
        this.updateRenderers().then(this.updateGridRenderers.bind(this));
      }, this);

      this.model.on('selection-model-changed', () => {
        this.grid.selectionModel = this.model.selectionModel;
      });

      //@ts-ignore
      this.pWidget.addWidget(this.grid);
    });
  }

  /**
   * 
   * RendererMap.Resolver function to select a CellRenderer based on the
   * provided cell metadata.
   * 
   * @param config - CellConfig for the cell to be rendered.
   */
  private _rendererResolver(config: CellRenderer.CellConfig): CellRenderer {
    const columnName: string = config.metadata['name'];
    return this.renderers.hasOwnProperty(columnName)
      ? this.renderers[columnName].renderer
      : this.default_renderer.renderer
  }

  private updateRenderers() {

    // Unlisten to previous renderers
    if (this.default_renderer) {
      this.stopListening(this.default_renderer, 'renderer-changed');
    }
    for (const key in this.renderers) {
      this.stopListening(this.renderers[key], 'renderer-changed');
    }

    // And create views for new renderers
    let promises = [];

    const default_renderer = this.model.get('default_renderer');
    promises.push(this.create_child_view(default_renderer).then((defaultRendererView: any) => {
      this.default_renderer = defaultRendererView;

      this.listenTo(this.default_renderer, 'renderer-changed', this.updateGridRenderers.bind(this));
    }));

    let renderer_promises: Dict<Promise<any>> = {};
    _.each(this.model.get('renderers'), (model: CellRendererModel, key: string) => {
      renderer_promises[key] = this.create_child_view(model);
    });
    promises.push(resolvePromisesDict(renderer_promises).then((rendererViews: Dict<CellRendererView>) => {
      this.renderers = rendererViews;

      for (const key in rendererViews) {
        this.listenTo(rendererViews[key], 'renderer-changed', this.updateGridRenderers.bind(this));
      }
    }));

    return Promise.all(promises);
  }

  private updateGridRenderers() {
    this.grid.cellRenderers.update({ 'body': this._rendererResolver.bind(this) });
  }

  protected updateGridStyle() {
    this.updateHeaderRenderer();
    const rowHeaderRenderer = new TextRenderer({
      textColor: Theme.getFontColor(1),
      backgroundColor: Theme.getBackgroundColor(2),
      horizontalAlignment: 'center',
      verticalAlignment: 'center'
    });
    this.grid.cellRenderers.update({ 'row-header': rowHeaderRenderer });

    const scrollShadow = {
      size: 4,
      color1: Theme.getBorderColor(1, 1.0),
      color2: Theme.getBorderColor(1, 0.5),
      color3: Theme.getBorderColor(1, 0.0)
    }

    this.grid.style = {
      voidColor: Theme.getBackgroundColor(),
      backgroundColor: Theme.getBackgroundColor(),
      gridLineColor: Theme.getBorderColor(),
      headerGridLineColor: Theme.getBorderColor(1),
      selectionFillColor: Theme.getBrandColor(2, 0.4),
      selectionBorderColor: Theme.getBrandColor(1),
      headerSelectionFillColor: Theme.getBackgroundColor(3, 0.4),
      headerSelectionBorderColor: Theme.getBorderColor(1),
      cursorFillColor: Theme.getBrandColor(3, 0.4),
      cursorBorderColor: Theme.getBrandColor(1),
      scrollShadow: scrollShadow,
    };
  }

  private updateHeaderRenderer() {
    const headerRenderer = new HeaderRenderer({
      textColor: Theme.getFontColor(1),
      backgroundColor: Theme.getBackgroundColor(2),
      horizontalAlignment: 'center'
    });
    headerRenderer.model = this.model.data_model;

    this.grid.cellRenderers.update({ 'column-header': headerRenderer });
    this.grid.cellRenderers.update({ 'corner-header': headerRenderer });
  }

  private _createCommandRegistry(): CommandRegistry {
    const commands = new CommandRegistry();
    commands.addCommand(IPyDataGridContextMenu.CommandID.SortAscending, {
      label: 'Sort ASC',
      mnemonic: 1,
      iconClass: 'fa fa-arrow-up',
      execute: (args): void => {
        const cellClick: IPyDataGridContextMenu.CommandArgs = args as IPyDataGridContextMenu.CommandArgs;
        this.model.data_model.addTransform({
          type: 'sort',
          columnIndex: cellClick.columnIndex + 1,
          desc: false
        })
      }
    });
    commands.addCommand(IPyDataGridContextMenu.CommandID.SortDescending, {
      label: 'Sort DESC',
      mnemonic: 1,
      iconClass: 'fa fa-arrow-down',
      execute: (args) => {
        const cellClick: IPyDataGridContextMenu.CommandArgs = args as IPyDataGridContextMenu.CommandArgs;
        this.model.data_model.addTransform({
          type: 'sort',
          columnIndex: cellClick.columnIndex + 1,
          desc: true
        })
      }
    });
    commands.addCommand(IPyDataGridContextMenu.CommandID.RevertGrid, {
      label: 'Revert grid',
      mnemonic: 8,
      iconClass: 'fa fa-refresh',
      execute: (args) => {
        this.model.data_model.clearTransforms();
      }
    });
    commands.addCommand(IPyDataGridContextMenu.CommandID.OpenFilterByConditionDialog, {
      label: 'Filter by condition...',
      mnemonic: 4,
      iconClass: 'fa fa-filter',
      execute: (args) => {
        let commandArgs = <IPyDataGridContextMenu.CommandArgs>args
        this.filterDialog.open({
          x: commandArgs.clientX,
          y: commandArgs.clientY,
          region: commandArgs.region,
          columnIndex: commandArgs.columnIndex,
          forceX: false,
          forceY: false,
          mode: 'condition'
        });
      }
    });
    commands.addCommand(IPyDataGridContextMenu.CommandID.OpenFilterByValueDialog, {
      label: 'Filter by value...',
      mnemonic: 4,
      iconClass: 'fa fa-filter',
      execute: (args) => {
        let commandArgs = <IPyDataGridContextMenu.CommandArgs>args
        this.filterDialog.open({
          x: commandArgs.clientX,
          y: commandArgs.clientY,
          region: commandArgs.region,
          columnIndex: commandArgs.columnIndex,
          forceX: false,
          forceY: false,
          mode: 'value'
        });
      }
    });
    return commands;

  }

  renderers: Dict<CellRendererView>;
  default_renderer: CellRendererView;

  grid: DataGrid;

  pWidget: JupyterPhosphorPanelWidget;

  model: DataGridModel;

  contextMenu: IPyDataGridContextMenu;
  filterDialog: InteractiveFilterDialog;
}

export {
  TextRendererModel, TextRendererView,
  BarRendererModel, BarRendererView,
} from './cellrenderer';

export {
  VegaExprModel, VegaExprView
} from './vegaexpr';
