import { Transform } from './transform';

import { View } from './view';

import {
  FilterExecutor,
  HideExecutor,
  SortExecutor,
  TransformExecutor,
} from './transformExecutors';

import { each } from '@lumino/algorithm';

import { JSONExt } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';
import { DataSource } from '../datasource';

/**
 * A state manager for tracking the active transformations of a model.
 */
export class TransformStateManager {
  protected _add(transform: Transform.TransformSpec): void {
    // Add column to state if not already present
    if (!this._state.hasOwnProperty(transform.column)) {
      this._state[transform.column] = {
        sort: undefined,
        filter: undefined,
        hide: undefined,
      };
    }

    // Add the transform to the state
    switch (transform.type) {
      case 'sort':
        // Only allow one sort transform.
        // TODO: Support multiple sort columns.
        for (const key of Object.keys(this._state)) {
          this._state[key]['sort'] = undefined;
        }
        this._state[transform.column]['sort'] = transform;
        break;
      case 'filter':
        this._state[transform.column]['filter'] = transform;
        break;
      case 'hide':
        this._state[transform.column]['hide'] = transform;
        break;
      default:
        throw 'unreachable';
    }
  }

  /**
   * Adds the provided transform to the active state.
   *
   * @param transform - The transform to be added.
   */
  add(transform: Transform.TransformSpec): void {
    try {
      this._add(transform);
      this._changed.emit({
        type: 'transforms-updated',
        transforms: this.activeTransforms,
      });
    } catch (err) {
      this.clear();
    }
  }

  /**
   * Replaces the existing state with the provided list of transforms.
   *
   * @param transforms - The list of transforms to be added.
   */
  replace(transforms: Transform.TransformSpec[]): void {
    // Bail if the transforms are the same as the current state
    if (JSONExt.deepEqual(transforms, this.activeTransforms)) {
      return;
    }

    try {
      this._state = {};
      each(transforms, (transform) => {
        this._add(transform);
      });
      this._changed.emit({
        type: 'transforms-updated',
        transforms: this.activeTransforms,
      });
    } catch (err) {
      this.clear();
    }
  }

  /**
   * Creates a new data model View with the active transformations.
   *
   * @param data - The dataset to operate on.
   */
  createView(data: Readonly<DataSource>): View {
    const executors = this._createExecutors(data);
    let transformedData = data;
    each(executors, (transform: TransformExecutor) => {
      transformedData = transform.apply(transformedData);
    });
    return new View(transformedData);
  }

  /**
   * Creates an optimized list of TransformExecutors for the provided data.
   *
   * @param data - The dataset to operate on.
   */
  private _createExecutors(data: Readonly<DataSource>): TransformExecutor[] {
    const sortExecutors: SortExecutor[] = [];
    const filterExecutors: FilterExecutor[] = [];
    const hideExecutors: HideExecutor[] = [];

    Object.keys(this._state).forEach((column) => {
      const transform: TransformStateManager.IColumn = this._state[column];

      if (transform.sort) {
        let dType = '';
        for (const field of data.schema.fields) {
          if (field.name === transform.sort.column) {
            dType = field.type;
          }
        }

        const executor = new SortExecutor({
          field: transform.sort.column,
          dType,
          desc: transform.sort.desc,
        });
        sortExecutors.push(executor);
      }

      if (transform.filter) {
        let dType = '';
        for (const field of data.schema.fields) {
          if (field.name === transform.filter.column) {
            dType = field.type;
          }
        }

        const executor = new FilterExecutor({
          field: transform.filter.column,
          dType,
          operator: transform.filter.operator,
          value: transform.filter.value,
        });
        filterExecutors.push(executor);
      }
      if (transform.hide) {
        let dType = '';
        for (const field of data.schema.fields) {
          if (field.name === transform.hide.column) {
            dType = field.type;
          }
        }

        const executor = new HideExecutor({
          field: transform.hide.column,
          dType,
          hideAll: transform.hide.hideAll,
        });
        hideExecutors.push(executor);
      }
    });

    // Always put filters first
    return [...filterExecutors, ...sortExecutors, ...hideExecutors];
  }

  /**
   * Removes the provided transformation from the active state.
   *
   * @param column - The index of the column state to be removed.
   *
   * @param transformType - The type of the transform to be removed from state.
   */
  remove(column: string, transformType: string): void {
    // Return immediately if the key is not in the state
    if (!this._state.hasOwnProperty(column)) {
      return;
    }

    try {
      const columnState = this._state[column];
      if (transformType === 'sort') {
        columnState.sort = undefined;
      } else if (transformType === 'filter') {
        columnState.filter = undefined;
      } else if (transformType === 'hide') {
        columnState.hide = undefined;
      } else {
        throw 'unreachable';
      }
      if (!columnState.sort && !columnState.filter && !columnState.hide) {
        delete this._state[column];
      }
      this._changed.emit({
        type: 'transforms-updated',
        transforms: this.activeTransforms,
      });
    } catch (err) {
      this.clear();
    }
  }

  /**
   * Returns the transform metadata for the provided column.
   *
   * @param column - The column index of the metadata to be retrieved.
   */
  metadata(column: string): TransformStateManager.IColumn | undefined {
    if (!this._state.hasOwnProperty(column)) {
      return undefined;
    } else {
      return this._state[column];
    }
  }

  /**
   * Removes all transformations from the active state.
   */
  clear(): void {
    this._state = {};
    this._changed.emit({
      type: 'transforms-updated',
      transforms: this.activeTransforms,
    });
  }

  /**
   * A signal emitted when the transform state has changed.
   */
  get changed(): ISignal<this, TransformStateManager.IEvent> {
    return this._changed;
  }

  /**
   * Returns an array of the active Transforms in state
   */
  get activeTransforms(): Transform.TransformSpec[] {
    const transforms: Transform.TransformSpec[] = [];
    each(Object.keys(this._state), (column) => {
      if (this._state[column].sort) {
        transforms.push(this._state[column].sort!);
      }
      if (this._state[column].filter) {
        transforms.push(this._state[column].filter!);
      }
      if (this._state[column].hide) {
        transforms.push(this._state[column].hide!);
      }
    });
    return transforms;
  }

  getFilterTransform(column: string): Transform.TransformSpec | undefined {
    if (!this._state.hasOwnProperty(column)) {
      return undefined;
    }

    return this._state[column].filter;
  }

  private _state: TransformStateManager.IState = {};
  private _changed = new Signal<this, TransformStateManager.IEvent>(this);
}

/**
 * The namespace for the `TransformStateManager` class statics.
 */
export namespace TransformStateManager {
  /**
   * An object when specifies the schema for a single column of state.
   */
  export interface IColumn {
    filter: Transform.Filter | undefined;
    sort: Transform.Sort | undefined;
    hide: Transform.Hide | undefined;
  }
  export interface IState {
    [key: string]: IColumn;
  }
  export interface IEvent {
    readonly type: 'transforms-updated';
    readonly transforms: Transform.TransformSpec[];
  }
}
