import { DataGrid } from '@lumino/datagrid';

import { DataModel } from '@lumino/datagrid';

import { CommandRegistry } from '@lumino/commands';

import { Menu } from '@lumino/widgets';

/**
 * An object which provides context menus for the data grid.
 *
 * #### Notes
 * This item creates one Menu widget, then changes it's items based on
 * the `cellClick` signal from `DataGrid`.
 */
export abstract class GridContextMenu {
  /**
   * Construct a new grid context menu.
   *
   * @param options - The options for initializing the context menu.
   */
  constructor(options: GridContextMenu.IOptions) {
    this._menu = new Menu({ commands: options.commands });
    this._menu.addClass('ipydatagrid-context-menu');
  }

  /**
   * Opens the context menu in reponse to the `cellClick` signal of the
   * data grid.
   *
   * @param grid - The "sender" of the signal.
   *
   * @param hit  - The "value" of the signal.
   */
  abstract open(grid: DataGrid, hit: DataGrid.HitTestResult): void;

  /**
   * The menu widget which displays the relevant context items.
   */
  protected readonly _menu: Menu;
}

/**
 * The namespace for the `GridContextMenu` class statics.
 */
export namespace GridContextMenu {
  /**
   * An options object for initializing a data grid.
   */
  export interface IOptions {
    /**
     * The data grid the context menu should be attached to.
     */
    grid: DataGrid;

    /**
     * The command registry to use with the context menu.
     */
    commands: CommandRegistry;

    /**
     * The custom renderer to use to render menu items.
     */
    renderer?: Menu.Renderer;
  }
}

/**
 * An WIP object which provides context menus for the data grid.
 *
 * #### Notes
 * This is primarily here for demo purposes to demonstrate how we may want to
 * manage context menus.
 */
export class FeatherGridContextMenu extends GridContextMenu {
  /**
   * Opens the context menu in reponse to the `cellClick` signal of the
   * data grid.
   *
   * @param grid - The "sender" of the signal.
   *
   * @param hit  - The "value" of the signal.
   */
  open(grid: DataGrid, hit: DataGrid.HitTestResult): void {
    // Discard the current menu items.
    this._menu.clearItems();

    // Create the args that will be provided to the commands' .execute() method
    const args: FeatherGridContextMenu.CommandArgs = {
      region: hit.region as DataModel.CellRegion,
      rowIndex: hit.row,
      columnIndex: hit.column,
      clientX: hit.x,
      clientY: hit.y,
    };

    // Add menu items based on the region of the grid that was clicked on.
    switch (hit.region) {
      case 'column-header':
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.SortAscending,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.SortDescending,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.OpenFilterByConditionDialog,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.OpenFilterByValueDialog,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.ClearThisFilter,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.ClearFiltersInAllColumns,
          args: args,
        });
        break;
      case 'corner-header':
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.SortAscending,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.SortDescending,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.OpenFilterByConditionDialog,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.OpenFilterByValueDialog,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.ClearThisFilter,
          args: args,
        });
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.ClearFiltersInAllColumns,
          args: args,
        });
        break;
      case 'body':
        this._menu.addItem({
          command: FeatherGridContextMenu.CommandID.RevertGrid,
          args: args,
        });
        break;
      default:
        throw 'unreachable';
    }

    // Open context menu at location of the click event
    this._menu.open(hit.x, hit.y);
  }
}

/**
 * The namespace for the `IPyDataGridContextMenu` class statics.
 */
export namespace FeatherGridContextMenu {
  /**
   * An options object for initializing a context menu.
   */
  export interface IOptions {
    /**
     * The data grid to listen to clicks on.
     */
    grid: DataGrid;

    /**
     * The command registry used by the menu.
     */
    commands: CommandRegistry;
  }

  /**
   * Command ID strings for the IpyDataGridContextMenu.
   */
  export enum CommandID {
    SortAscending = 'sort:Asc',
    SortDescending = 'sort:Desc',
    OpenFilterByConditionDialog = 'filterCondition:openDialog',
    OpenFilterByValueDialog = 'filterValue:openDialog',
    RevertGrid = 'grid:reset',
    ClearThisFilter = 'filter:clearCurrentColumn',
    ClearFiltersInAllColumns = 'filter:clearAllColumns',
  }

  /**
   * Arguments to be provided to a command for execution.
   */
  export type CommandArgs = {
    region: DataModel.CellRegion;
    rowIndex: number;
    columnIndex: number;
    clientX: number;
    clientY: number;
  };
}
