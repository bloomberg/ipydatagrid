/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2017, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/

import { DataModel } from '@lumino/datagrid';
import { View } from './view';
import { DataSource } from '../datasource';
import { Dict } from '@jupyter-widgets/base';

/**
 * A View implementation for immutable in-memory JSON data.
 *
 * Note: Most of this is just repurposed from JSONModel, and can likely be
 * streamlined quite a bit.
 */
export class StreamingView extends View {
  /**
   * Create a view with streaming data.
   *
   * @param options - The datasource for initializing the view.
   */
  constructor(options: StreamingView.IOptions) {
    super(options.datasource);

    this._rowCount = options.rowCount;
  }

  /**
   * Get the row count for a region in the view.
   *
   * @param region - The row region of interest.
   *
   * @returns - The row count for the region.
   */
  rowCount(region: DataModel.RowRegion): number {
    if (region === 'body') {
      return this._rowCount;
    } else {
      return this._bodyFields[0].rows.length;
    }
  }

  /**
   * Get the data value for a cell in the view.
   *
   * @param region - The cell region of interest.
   *
   * @param row - The row index of the cell of interest.
   *
   * @param column - The column index of the cell of interest.
   *
   * @param returns - The data value for the specified cell.
   *
   * #### Notes
   * A `missingValue` as defined by the schema is converted to `null`.
   */
  data(region: DataModel.CellRegion, row: number, column: number): any {
    if (region == 'body') {
      const field = this._bodyFields[column];

      if (this._streamed_data[field.name] !== undefined) {
        const value = this._streamed_data[field.name][row];
        return value !== undefined ? value : '...';
      }

      return '...';
    }

    if (region == 'row-header') {
      const field = this._headerFields[column];

      if (this._streamed_data[field.name] !== undefined) {
        const value = this._streamed_data[field.name][row];
        return value !== undefined ? value : '...';
      }

      return '...';
    }

    return super.data(region, row, column);
  }

  setDataRange(
    r1: number,
    r2: number,
    c1: number,
    c2: number,
    value: DataSource,
  ) {
    let field: DataSource.IField;

    // Update body
    for (let column = c1; column <= c2; column++) {
      field = this._bodyFields[column];

      if (this._streamed_data[field.name] === undefined) {
        this._streamed_data[field.name] = [];
      }

      let r = 0;

      for (let row = r1; row <= r2; row++) {
        this._streamed_data[field.name][row] = value.data[field.name][r];
        r++;
      }
    }

    // Update header fields
    for (let column = 0; column < this._headerFields.length; column++) {
      field = this._headerFields[column];

      if (this._streamed_data[field.name] === undefined) {
        this._streamed_data[field.name] = [];
      }

      let r = 0;
      for (let row = r1; row <= r2; row++) {
        this._streamed_data[field.name][row] = value.data[field.name][r];
        r++;
      }
    }
  }

  setData(value: any, row: number, column: number) {
    const field = this._bodyFields[column];

    if (this._streamed_data[field.name] === undefined) {
      this._streamed_data[field.name] = [];
    }

    this._streamed_data[field.name][row] = value;
  }

  hasData(row: number, column: number): boolean {
    const field = this._bodyFields[column];

    if (this._streamed_data[field.name] === undefined) {
      return false;
    }

    if (this._streamed_data[field.name][row] === undefined) {
      return false;
    }

    return true;
  }

  private _streamed_data: Dict<any[]> = {};
  private readonly _rowCount: number;
}

export namespace StreamingView {
  export interface IOptions {
    /**
     * The datasource.
     */
    datasource: DataSource;

    /**
     * The row number of the grid.
     */
    rowCount: number;
  }
}
