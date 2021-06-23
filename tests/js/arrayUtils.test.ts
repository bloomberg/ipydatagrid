import { DataGenerator } from '../js/testUtils';
import { ViewBasedJSONModel } from '../../js/core/viewbasedjsonmodel';
import { ArrayUtils } from '../../js/utils';

describe('Test multi index array utilities', () => {
  const testData = DataGenerator.multiIndexCol(
    {
      data: [
        {
          name: "('year', '')",
          type: 'number',
          data: [2013, 2013, 2014, 2014],
        },
        { name: "('visit', '')", type: 'number', data: [1, 2, 1, 2] },
        {
          name: "('Bob', 'HR')",
          type: 'number',
          data: [41.0, 28.0, 42.0, 37.0],
        },
        {
          name: "('Bob', 'Temp')",
          type: 'number',
          data: [37.1, 35.2, 37.3, 39.2],
        },
        {
          name: "('Guido', 'HR')",
          type: 'number',
          data: [50.0, 35.0, 42.0, 31.0],
        },
        {
          name: "('Guido', 'Temp')",
          type: 'number',
          data: [37.7, 37.1, 37.4, 35.1],
        },
        {
          name: "('Sue', 'HR')",
          type: 'number',
          data: [23.0, 48.0, 44.0, 34.0],
        },
        {
          name: "('Sue', 'Temp')",
          type: 'number',
          data: [37.5, 37.1, 37.5, 39.0],
        },
        { name: "('ipydguuid', '')", type: 'number', data: [0, 1, 2, 3] },
      ],
      length: 4,
      primaryKeyData: ["('year', '')", "('visit', '')", "('ipydguuid', '')"],
    },
    "('ipydguuid', '')",
  );

  // Creating a model
  const testModel = new ViewBasedJSONModel(testData);
  // Generating an array with location of nested level headers
  const mutltiIndexArrayLocations =
    ArrayUtils.generateMultiIndexArrayLocations(testModel);

  test('Test .generateMultiIndexArrayLocations()', async () => {
    expect(mutltiIndexArrayLocations).toEqual([2, 3, 4, 5, 6, 7]);
  });

  // Generating an array with location of nested level headers
  const nestedColumnDataGridIndices = ArrayUtils.generateColMergedCellLocations(
    testModel,
    mutltiIndexArrayLocations,
  );

  test('Test .generateColMergedCellLocations()', async () => {
    expect(nestedColumnDataGridIndices).toEqual([
      [
        [
          [0, 0],
          [0, 1],
        ],
        [
          [0, 2],
          [0, 3],
        ],
        [
          [0, 4],
          [0, 5],
        ],
      ],
      [[[1, 0]], [[1, 1]], [[1, 2]], [[1, 3]], [[1, 4]], [[1, 5]]],
    ]);
  });

  test('Test .validateMergingHierarchy() for nested columns', async () => {
    expect(
      ArrayUtils.validateMergingHierarchy(nestedColumnDataGridIndices),
    ).toBe(true);
  });

  test('Test .generateColumnCellGroups()', async () => {
    const expected = [
      { r1: 0, c1: 0, r2: 0, c2: 1 },
      { r1: 0, c1: 2, r2: 0, c2: 3 },
      { r1: 0, c1: 4, r2: 0, c2: 5 },
    ];

    const actual = ArrayUtils.generateColumnCellGroups(
      nestedColumnDataGridIndices,
    );
    expect(actual).toEqual(expected);
  });
});
