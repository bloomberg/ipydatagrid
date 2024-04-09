import { DataModel } from '@lumino/datagrid';
import { StreamingView } from './streamingview';
import { ViewBasedJSONModel } from './viewbasedjsonmodel';
import { DataSource } from '../datasource';

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

  updateDataset(options: StreamingViewBasedJSONModel.IOptions): void {
    this._dataset = options.datasource;
    this._updatePrimaryKeyMap();
    const view = new StreamingView({
      datasource: this._dataset,
      rowCount: options.rowCount,
    });
    this.currentView = view;
  }

  data(region: DataModel.CellRegion, row: number, column: number): any {
    if (region === 'body' && !this.currentView.hasData(row, column)) {
      return '...';
    }
    return this.currentView.data(region, row, column);
  }

  updateCellValue(options: ViewBasedJSONModel.IUpdateCellValuesOptions): void {
    if (options.region != 'body') {
      return;
    }
    this._currentView.setData(options.value, options.row, options.column);
  }

  protected get currentView(): StreamingView {
    return this._currentView;
  }

  protected set currentView(view: StreamingView) {
    super.currentView = view;
  }

  protected _currentView: StreamingView;
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
  }
}
