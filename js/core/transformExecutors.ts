import { Dict } from '@jupyter-widgets/base';

import { DataSource } from '../datasource';
import { Transform } from './transform';

import * as moment from 'moment';

/**
 * An object that defines a data transformation executor.
 */
export abstract class TransformExecutor {
  /**
   * Apply a transformation to the provided data, then return a new copy.
   */
  abstract apply(input: TransformExecutor.IData): TransformExecutor.IData;
}

/**
 * The namespace for the `Transform` class statics.
 */
export namespace TransformExecutor {
  /**
   * A read only type for the input/output of .apply().
   */
  export type IData = Readonly<DataSource>;
}

export class HideExecutor extends TransformExecutor {
  constructor(options: HideExecutor.IOptions) {
    super();
    this._options = options;
  }

  // input has data and schema
  public apply(input: TransformExecutor.IData): TransformExecutor.IData {
    const newSchema = { ...input.schema };

    console.log('input.schema', input.schema);
    if (this._options.hideAll) {
      newSchema.fields = newSchema.fields.filter(
        (field) => field.name === 'index_column',
      );
    } else {
      newSchema.fields = newSchema.fields.filter(
        (field) => field.name !== this._options.field,
      );
    }

    return new DataSource(input.data, input.fields, newSchema);
  }

  protected _options: HideExecutor.IOptions;
}

/**
 * The namespace for the `HideExecutor` class statics.
 */
export namespace HideExecutor {
  /**
   * An options object for initializing a Hide.
   */
  export interface IOptions {
    /**
     * The name of the field to hide in the data source.
     */
    field: string;

    /**
     * The data type of the column associated with this transform.
     */
    dType: string;

    /**
     * Boolean indicating if all columns should be hidden
     */
    hideAll: boolean;
  }
}

/**
 * A transformation that filters a single field by the provided operator and
 * value.
 *
 * Note: This is a WIP
 */
export class FilterExecutor extends TransformExecutor {
  /**
   * Create a new transformation.
   *
   * @param options - The options for initializing the transformation.
   */
  constructor(options: FilterExecutor.IOptions) {
    super();
    this._options = options;
  }

  /**
   * Apply a transformation to the provided data.
   *
   * @param input - The data to be operated on.
   */
  public apply(input: TransformExecutor.IData): TransformExecutor.IData {
    let filterFunc: (idx: number) => boolean;
    const field = this._options.field;
    switch (this._options.operator) {
      case '>':
        filterFunc = (idx: number) => {
          if (['date', 'datetime', 'time'].includes(this._options.dType)) {
            const target = moment.default.utc(input.data[field][idx]);
            const value = moment.default.utc(this._options.value);
            return target.isAfter(value, 'day');
          }
          return input.data[field][idx] > this._options.value;
        };
        break;
      case '<':
        filterFunc = (idx: number) => {
          if (['date', 'datetime', 'time'].includes(this._options.dType)) {
            const target = moment.default.utc(input.data[field][idx]);
            const value = moment.default.utc(this._options.value);
            return target.isBefore(value, 'day');
          }
          return input.data[field][idx] < this._options.value;
        };
        break;
      case '<=':
        filterFunc = (idx: number) => {
          if (['date', 'datetime', 'time'].includes(this._options.dType)) {
            const target = moment.default.utc(input.data[field][idx]);
            const value = moment.default.utc(this._options.value);
            return target.isSameOrBefore(value, 'day');
          }
          return input.data[field][idx] <= this._options.value;
        };
        break;
      case '>=':
        filterFunc = (idx: number) => {
          if (['date', 'datetime', 'time'].includes(this._options.dType)) {
            const target = moment.default.utc(input.data[field][idx]);
            const value = moment.default.utc(this._options.value);
            return target.isSameOrAfter(value, 'day');
          }
          return input.data[field][idx] >= this._options.value;
        };
        break;
      case '=':
        filterFunc = (idx: number) => {
          if (['date', 'datetime', 'time'].includes(this._options.dType)) {
            const target = moment.default.utc(input.data[field][idx]);
            const value = moment.default.utc(this._options.value);
            return target.isSame(value);
          }
          return input.data[field][idx] == this._options.value;
        };
        break;
      case '!=':
        filterFunc = (idx: number) => {
          if (['date', 'datetime', 'time'].includes(this._options.dType)) {
            const target = moment.default.utc(input.data[field][idx]);
            const value = moment.default.utc(this._options.value);
            return !target.isSame(value);
          }
          return input.data[field][idx] !== this._options.value;
        };
        break;
      case 'empty':
        filterFunc = (idx: number) => {
          return input.data[field][idx] === null;
        };
        break;
      case 'notempty':
        filterFunc = (idx: number) => {
          return input.data[field][idx] !== null;
        };
        break;
      case 'in':
        filterFunc = (idx: number) => {
          const values = <any[]>this._options.value;
          return values.includes(input.data[field][idx]);
        };
        break;
      case 'between':
        filterFunc = (idx: number) => {
          const values = <any[]>this._options.value;

          if (['date', 'datetime', 'time'].includes(this._options.dType)) {
            const target = moment.default.utc(input.data[field][idx]);
            const lowValue = moment.default.utc(values[0]);
            const highValue = moment.default.utc(values[1]);

            return target.isBetween(lowValue, highValue, 'day');
          }

          return (
            input.data[field][idx] > values[0] &&
            input.data[field][idx] < values[1]
          );
        };
        break;
      case 'startswith':
        filterFunc = (idx: number) => {
          return input.data[field][idx].startsWith(this._options.value);
        };
        break;
      case 'endswith':
        filterFunc = (idx: number) => {
          return input.data[field][idx].endsWith(this._options.value);
        };
        break;
      case 'stringContains':
        filterFunc = (idx: number) => {
          return String(input.data[field][idx])
            .toLowerCase()
            .includes(String(this._options.value).toLowerCase());
        };
        break;
      case 'contains':
        filterFunc = (idx: number) => {
          return input.data[field][idx].includes(this._options.value);
        };
        break;
      case '!contains':
        filterFunc = (idx: number) => {
          return !input.data[field][idx].includes(this._options.value);
        };
        break;
      case 'isOnSameDay':
        filterFunc = (idx: number) => {
          const target = moment.default.utc(input.data[field][idx]);
          const value = moment.default.utc(this._options.value);
          return target.isSame(value, 'day');
        };
        break;
      default:
        throw 'unreachable';
    }

    const data: Dict<any[]> = {};
    const indices = Array.from(Array(input.length).keys()).filter(filterFunc);

    // There is a better approach for this
    // We don't need to copy the data
    // We should always keep the datasource intact and
    // create the "views" in the transform's apply methods
    // The view would then keep the indices in memory and apply the sorting
    // upon data request
    for (const column of Object.keys(input.data)) {
      let i = 0;
      data[column] = [];
      for (const idx of indices) {
        data[column][i++] = input.data[column][idx];
      }
    }

    return new DataSource(data, input.fields, input.schema);
  }

  protected _options: FilterExecutor.IOptions;
}

/**
 * The namespace for the `FilterExecutor` class statics.
 */
export namespace FilterExecutor {
  /**
   * An options object for initializing a Filter.
   */
  export interface IOptions {
    /**
     * The name of the field in the data source.
     */
    field: string;

    /**
     * The data type of the column associated with this transform.
     */
    dType: string;

    /**
     * The operator to use for the comparison.
     */
    operator: Transform.FilterOperator;

    /**
     * The value(s) to filter by.
     */
    value: string | string[] | number | number[];
  }
}

/**
 * A transformation that sorts the provided data by the provided field.
 *
 * Note: This is a WIP
 */
export class SortExecutor extends TransformExecutor {
  /**
   * Creates a new sort transformation
   *
   * @param options - The options for initializing the transformation.
   */
  constructor(options: SortExecutor.IOptions) {
    super();
    this._options = options;
  }

  /**
   * Apply a transformation to the provided data.
   *
   * Note: Currently ignores the `desc` parameter.
   *
   * @param input - The data to be operated on.
   */
  public apply(input: TransformExecutor.IData): TransformExecutor.IData {
    let sortFunc: (a: number, b: number) => number;
    const field = this._options.field;
    const columnDataType = this._options.dType;

    // Adding string checks within the sort function so we do
    // not have to mutate in-place the original types of the
    // values of the column into strings. This allows the
    // displayed values to maintain their original types but
    // be sorted as if they were all strings.
    const stringifyIfNeeded = (value: any) => {
      if (typeof value != 'string') {
        return String(value);
      }
      return value;
    };

    const isNaNorNull = (value: any) => {
      return (
        value === null ||
        (typeof value === 'number' && Number.isNaN(value)) ||
        (value instanceof Date && Number.isNaN(value.getTime()))
      );
    };

    const nanIndices = Array.from(Array(input.length).keys()).filter(
      (idx: number) => {
        return isNaNorNull(input.data[field][idx]);
      },
    );
    const nonNanIndices = Array.from(Array(input.length).keys()).filter(
      (idx: number) => {
        return !isNaNorNull(input.data[field][idx]);
      },
    );
    if (columnDataType == 'string') {
      if (this._options.desc) {
        sortFunc = (a: number, b: number): number => {
          return stringifyIfNeeded(input.data[field][a]) <
            stringifyIfNeeded(input.data[field][b])
            ? 1
            : -1;
        };
      } else {
        sortFunc = (a: number, b: number): number => {
          return stringifyIfNeeded(input.data[field][a]) >
            stringifyIfNeeded(input.data[field][b])
            ? 1
            : -1;
        };
      }
    } else {
      if (this._options.desc) {
        sortFunc = (a: number, b: number): number => {
          return input.data[field][a] < input.data[field][b] ? 1 : -1;
        };
      } else {
        sortFunc = (a: number, b: number): number => {
          return input.data[field][a] > input.data[field][b] ? 1 : -1;
        };
      }
    }

    const data: Dict<any[]> = {};

    let indices = nonNanIndices.sort(sortFunc);
    indices = indices.concat(nanIndices);

    // There is a better approach for this
    // We don't need to copy the data
    // We should always keep the datasource intact and
    // create the "views" in the transform's apply methods
    // The view would then keep the indices in memory and apply the sorting
    // upon data request
    for (const column of Object.keys(input.data)) {
      let i = 0;
      data[column] = [];
      for (const idx of indices) {
        data[column][i++] = input.data[column][idx];
      }
    }

    return new DataSource(data, input.fields, input.schema);
  }

  protected _options: SortExecutor.IOptions;
}

/**
 * The namespace for the `SortExecutor` class statics.
 */
export namespace SortExecutor {
  /**
   * An options object for initializing a Sort.
   */
  export interface IOptions {
    /**
     * The name of the field in the data source.
     */
    field: string;

    /**
     * The data type of the column associated with this transform.
     */
    dType: string;

    /**
     * Indicates ascending or descending order for the sort.
     */
    desc: boolean;
  }
}

export namespace Private {
  export type JSONDate = 'date' | 'time' | 'datetime';
}
