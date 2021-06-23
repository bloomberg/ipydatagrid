const d3Color: any = require('d3-color');
import { CellGroup } from '@lumino/datagrid';

export namespace ArrayUtils {
  /**
   * Returns the locations of multi-index column arrays.
   * @param model the datamodel instance.
   */
  export function generateMultiIndexArrayLocations(model: any): number[] {
    // Removing the primary key uuid from the primary key array
    // as it is not used in the multi index location generation
    // process.
    const primaryKey = model._dataset.schema.primaryKey.slice(
      0,
      model._dataset.schema.primaryKey.length - 1,
    );
    const dataFields = model._dataset.schema.fields;
    const multiIndexLocationArr: number[] = [];
    // Subtracting one from the length of dataFields to account for
    // (remove) the invisible primary key uuid column.
    for (let i = 0; i < dataFields.length - 1; i++) {
      if (!primaryKey.includes(dataFields[i].name)) {
        multiIndexLocationArr.push(i);
      }
    }
    return multiIndexLocationArr;
  }

  /**
   * Returns an array of [mergedCellSiblingGroup]. Each element represents a row of columns.
   * The 0th row will be the top level group, and the n-th will be the last.
   * @param model the data model.
   * @param multiIndexArrayLocations index-based locations of all mutli-index columns.
   */
  export function generateColMergedCellLocations(
    model: any,
    multiIndexArrayLocations: number[],
  ): number[][][][] {
    // Terminating if no locations are passed.
    if (multiIndexArrayLocations.length === 0) {
      return [];
    }

    const dataFields = model._dataset.schema.fields;
    // The data grid doesn't count corner-headers when indexing column-headers, so if a given
    // datagrid has 5 columns, 2 of which are corner-headers, the index of the first column
    // header will not be 2, but 0. columnStartIndexOffset calculaates that offset so we
    // can correctly identify indices corresponding to column-headers.
    // Subtracting one from the start index offset to account for (remove) any
    // references to the primary key uuid column.
    const columnStartIndexOffset = model._dataset.schema.primaryKey.length - 1;
    const retArr: any[] = [];
    let curRow: any[] = [];
    const firstIndex = multiIndexArrayLocations[0];

    let prevVal: string | number | undefined = undefined;
    for (let i = 0; i < dataFields[firstIndex].rows.length; i++) {
      let curMergedRange: number[][] = [];
      for (const j of multiIndexArrayLocations) {
        const curVal = dataFields[j].rows[i];
        if (curMergedRange.length == 0 || prevVal == curVal) {
          curMergedRange.push([i, j - columnStartIndexOffset]);
        } else {
          curRow.push(curMergedRange);
          curMergedRange = [[i, j - columnStartIndexOffset]];
        }
        prevVal = curVal;
      }
      curRow.push(curMergedRange);
      retArr.push(curRow);
      curRow = [];
    }
    return retArr;
  }

  /**
   * Returns an array of [mergedCellSiblingGroup]. Each element represents a column of rows.
   * The 0th row will be the top level group, and the n-th will be the last.
   * @param model data model with schema and data fields
   * @returns index-based locations of all mutli-index rows.
   */
  export function generateRowMergedCellLocations(model: any): number[][][][] {
    // Removing internal primary key identifier.
    const primaryKey = model._dataset.schema.primaryKey.slice(
      0,
      model._dataset.schema.primaryKey.length - 1,
    );

    // Terminate if we're not dealing with nested row headers.
    if (!(primaryKey.length > 1)) {
      return [];
    }

    const data = model._dataset.data;
    const retArr = [];
    let curCol = [];

    let prevVal = undefined;
    for (let i = 0; i < primaryKey.length; i++) {
      let curMergedRange: any = [];
      for (let j = 0; j < data.length; j++) {
        const curVal = data[j][primaryKey[i]];
        if (curMergedRange.length == 0 || prevVal == curVal) {
          curMergedRange.push([j, i]);
        } else {
          curCol.push(curMergedRange);
          curMergedRange = [[j, i]];
        }
        prevVal = curVal;
      }
      curCol.push(curMergedRange);
      retArr.push(curCol);
      curCol = [];
    }

    return retArr;
  }

  /**
   * Checks whether the merged cell ranges conform to a valid hierarchy.
   * @param retVal boolean
   */
  export function validateMergingHierarchy(retVal: number[][][][]): boolean {
    let prevLevelLength;
    for (const mergeRange of retVal) {
      // First element - setting up the value of prevLevelLength
      if (prevLevelLength === undefined) {
        prevLevelLength = mergeRange.length;
        continue;
      }
      // If the current merged range list has a length that is less than
      // the previous range, it means the current level is a larger merged
      // range, which violates the hierarchy. The function terminates here
      // and returns false.
      if (mergeRange.length < prevLevelLength) {
        return false;
      }
      prevLevelLength = mergeRange.length;
    }
    return true;
  }

  /**
   * Generates a list of merged column cell groups for use in the data model.
   * @param indexLists index-based location of merged columns
   * @returns CellGroup[]
   */
  export function generateColumnCellGroups(
    indexLists: number[][][][],
  ): CellGroup[] {
    const columnGroup = [];
    for (let curRow = 0; curRow < indexLists.length; curRow++) {
      for (let groupNum = 0; groupNum < indexLists[curRow].length; groupNum++) {
        if (indexLists[curRow][groupNum].length > 1) {
          const groupLength = indexLists[curRow][groupNum].length;
          const c1 = indexLists[curRow][groupNum][0][1];
          const c2 = indexLists[curRow][groupNum][groupLength - 1][1];
          columnGroup.push({ r1: curRow, c1, r2: curRow, c2 });
        }
      }
    }

    return columnGroup;
  }

  /**
   * Generates a list of merged row cell groups for use in the data model.
   * @param indexLists index-based location of merged rows.
   * @returns CellGroup[]
   */
  export function generateRowCellGroups(
    indexLists: number[][][][],
  ): CellGroup[] {
    const rowGroup = [];
    for (let curCol = 0; curCol < indexLists.length; curCol++) {
      for (let groupNum = 0; groupNum < indexLists[curCol].length; groupNum++) {
        if (indexLists[curCol][groupNum].length > 1) {
          const groupLength = indexLists[curCol][groupNum].length;
          const r1 = indexLists[curCol][groupNum][0][0];
          const r2 = indexLists[curCol][groupNum][groupLength - 1][0];
          rowGroup.push({ r1: r1, c1: curCol, r2: r2, c2: curCol });
        }
      }
    }

    return rowGroup;
  }
}

// Scalar type
export type Scalar = null | boolean | number | string;

export namespace Scalar {
  export function isScalar(x: any): x is Scalar {
    return (
      x === null ||
      typeof x === 'boolean' ||
      typeof x === 'number' ||
      typeof x === 'string'
    );
  }
}

export namespace Theme {
  function applyOpacity(color: string, opacity: number) {
    const c = d3Color.rgb(color);
    c.opacity = opacity;

    return c.formatRgb();
  }

  export function getComputedColor(name: string) {
    const el = document.querySelector('.ipydatagrid-widget') || document.body;
    const color = window.getComputedStyle(el).getPropertyValue(name);
    if (color) {
      return color;
    }

    return '#ffffff';
  }

  export function getCSSColor(name: string, opacity = 1) {
    const color = getComputedColor(name);
    return applyOpacity(color, opacity);
  }

  export function getBackgroundColor(index = 0, opacity = 1) {
    return getCSSColor('--ipydatagrid-layout-color' + index, opacity);
  }

  export function getFontColor(index = 0, opacity = 1) {
    return getCSSColor('--ipydatagrid-ui-font-color' + index, opacity);
  }

  export function getBorderColor(index = 0, opacity = 1) {
    return getCSSColor('--ipydatagrid-border-color' + index, opacity);
  }

  export function getBrandColor(index = 0, opacity = 1) {
    return getCSSColor('--ipydatagrid-brand-color' + index, opacity);
  }
}
