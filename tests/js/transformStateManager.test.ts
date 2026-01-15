import { Transform } from '../../js/core/transform';
import { TransformStateManager } from '../../js/core/transformStateManager';
import { View } from '../../js/core/view';
import { DataGenerator } from './testUtils';

describe('Test .add()', () => {
  const testCases: Transform.TransformSpec[] = [
    { type: 'sort', column: 'test', desc: true },
    { type: 'filter', column: 'test', operator: '<', value: 5 },
  ];
  testCases.forEach((testCase) => {
    test(`State is update: ${testCase.type}-${testCase.columnIndex}`, () => {
      const tsm = new TransformStateManager();
      tsm.add(testCase);
      expect(tsm.activeTransforms[0]).toBe(testCase);
    });
  });
  test('Only allow one sort transform', () => {
    const tsm = new TransformStateManager();
    const transform1 = Private.simpleSort();
    const transform2: Transform.Sort = {
      type: 'sort',
      column: 'test2',
      desc: true,
    };
    tsm.add(transform1);
    tsm.add(transform2);
    // @ts-ignore
    expect(tsm._state[transform1.column][transform1.type]).toBeUndefined();
  });
  test('Clear state on error', () => {
    const tsm = new TransformStateManager();
    const transform = Private.simpleSort();
    const invalidTransform = {
      type: 'bad',
      columnIndex: 0,
      desc: true,
    };
    tsm.add(transform);
    // @ts-ignore
    tsm.add(invalidTransform);
    expect(tsm.activeTransforms.length).toBe(0);
  });
  test('Test that signal is emitted', () => {
    const tsm = new TransformStateManager();
    // @ts-ignore
    const mock = jest.spyOn(tsm._changed, 'emit');
    expect(mock).toBeCalledTimes(0);
    const transform = Private.simpleSort();
    tsm.add(transform);
    expect(mock).toBeCalledTimes(1);
  });
});

describe('Test .replace()', () => {
  test('Bail on no change', () => {
    const tsm = new TransformStateManager();
    const state = Private.simpleState();
    tsm.replace([state.sort!, state.filter!]);
    // @ts-ignore
    const mock = jest.spyOn(tsm._changed, 'emit');
    tsm.replace([state.sort!, state.filter!]);

    // Testing that no signal was emitted
    expect(mock).toBeCalledTimes(0);
  });
  test('State updated', () => {
    const tsm = new TransformStateManager();
    const state = Private.simpleState();
    const transform3: Transform.TransformSpec = {
      type: 'filter',
      column: 'test',
      operator: '=',
      value: 765,
    };

    tsm.add(transform3);
    tsm.replace([state.sort!, state.filter!]);
    expect(tsm.activeTransforms).toEqual([state.sort!, state.filter!]);
  });
  test('Clear on error', () => {
    const tsm = new TransformStateManager();
    const state = Private.simpleState();
    // @ts-ignore
    tsm.replace([state.sort!, state.filter!, {}]);
    expect(tsm.activeTransforms).toEqual([]);
  });
});

describe('Test .createView()', () => {
  test('View() is returned', () => {
    const data = DataGenerator.singleCol({
      name: 'test',
      type: 'number',
      data: [1, 2, 3],
    });
    const tsm = new TransformStateManager();
    const view = tsm.createView(data.data);
    expect(view).toBeInstanceOf(View);
  });
  test('View() has transformed data - filter', () => {
    const data = DataGenerator.singleCol({
      name: 'test',
      type: 'number',
      data: [-1, -2, 6, 7],
    });
    const tsm = new TransformStateManager();
    const transform = Private.simpleFilter();
    tsm.add(transform);
    const view = tsm.createView(data.data);
    const testData = view.dataset.data['test'];
    expect(testData).toEqual([-1, -2]);
  });
  test('View() has transformed data - sort', () => {
    const data = DataGenerator.singleCol({
      name: 'test',
      type: 'number',
      data: [3, 2, 4, 7],
    });
    const tsm = new TransformStateManager();
    const transform = Private.simpleSort();
    tsm.add(transform);
    const view = tsm.createView(data.data);
    const testData = view.dataset.data['test'];
    expect(testData).toEqual([7, 4, 3, 2]);
  });
});

describe('Test .remove()', () => {
  test('Remove sort transform', () => {
    const state = Private.simpleState();
    const tsm = new TransformStateManager();
    tsm.replace([state.sort!, state.filter!]);
    tsm.remove(state.filter!.column, state.filter!.type);
    expect(tsm.activeTransforms).toEqual([state.sort]);
  });
  test('Remove filter transform', () => {
    const state = Private.simpleState();
    const tsm = new TransformStateManager();
    tsm.replace([state.sort!, state.filter!]);
    tsm.remove(state.filter!.column, state.filter!.type);
    expect(tsm.activeTransforms).toEqual([state.sort]);
  });
  test('State cleared after error', () => {
    const state = Private.simpleState();
    const tsm = new TransformStateManager();
    tsm.replace([state.sort!, state.filter!]);
    tsm.remove(state.filter!.column, 'transformThatDoesntExist');
    expect(tsm.activeTransforms).toEqual([]);
  });
  test('State entry cleared if no sort or filter', () => {
    const transform1 = Private.simpleSort();
    const tsm = new TransformStateManager();
    tsm.add(transform1);
    tsm.remove(transform1.column, transform1.type);
    // @ts-ignore
    expect(tsm._state[transform1.column]).toBeUndefined();
  });
  test('No state change on invalid column', () => {
    const state = Private.simpleState();
    const tsm = new TransformStateManager();
    tsm.replace([state.sort!, state.filter!]);
    tsm.remove(state.filter!.column + 1, state.filter!.type);
    expect(tsm.activeTransforms).toEqual([state.sort!, state.filter!]);
  });
});

describe('Test .metadata()', () => {
  test('Get metadata for column - sort', () => {
    const transform1 = Private.simpleSort();
    const tsm = new TransformStateManager();
    tsm.add(transform1);
    const test = { filter: undefined, sort: transform1 };
    expect(tsm.metadata(transform1.column)).toEqual(test);
    expect(tsm.metadata(transform1.column + 1)).toBeUndefined();
  });
  test('Get metadata for column - filter', () => {
    const transform1 = Private.simpleFilter();
    const tsm = new TransformStateManager();
    tsm.add(transform1);
    const test = { filter: transform1, sort: undefined };
    expect(tsm.metadata(transform1.column)).toEqual(test);
    expect(tsm.metadata(transform1.column + 1)).toBeUndefined();
  });
});

describe('Test .clear()', () => {
  test('State is cleared', () => {
    const state = Private.simpleState();
    const tsm = new TransformStateManager();
    tsm.replace([state.sort!, state.filter!]);
    tsm.clear();
    expect(tsm.activeTransforms).toEqual([]);
  });
});

describe('Test .changed()', () => {
  test('Returns signal', () => {
    const tsm = new TransformStateManager();
    expect(tsm.changed).toHaveProperty('connect');
    expect(tsm.changed).toHaveProperty('disconnect');
  });
});

describe('Test .activeTransforms()', () => {
  test('.activeTransforms returns current state', () => {
    const state = Private.simpleState();
    const tsm = new TransformStateManager();
    tsm.replace([state.sort!, state.filter!]);
    expect(tsm.activeTransforms).toEqual([state.sort, state.filter]);
  });
});

/**
 * A namespace for functions that generate transforms for testing.
 */
namespace Private {
  /**
   * Returns a simple sort transform.
   */
  export function simpleSort(): Transform.Sort {
    return { type: 'sort', column: 'test', desc: true };
  }

  /**
   * Returns a simple filter transform.
   */
  export function simpleFilter(): Transform.Filter {
    return { type: 'filter', column: 'test', operator: '<', value: 0 };
  }

  export function simpleHide(): Transform.Hide {
    return { type: 'hide', column: 'test', hideAll: false };
  }

  /**
   * Returns a simple column of transform state.
   */
  export function simpleState(): TransformStateManager.IColumn {
    return { filter: simpleFilter(), sort: simpleSort(), hide: simpleHide() };
  }
}
