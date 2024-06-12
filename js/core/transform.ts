/**
 * A declarative spec for specifying transformations.
 */
export namespace Transform {
  export type TransformSpec =
    | Transform.Sort
    | Transform.Filter
    | Transform.Hide;

  /**
   * A declarative spec for the `Sort` transformation.
   */
  export type Sort = {
    /**
     * A type alias for this transformation.
     */
    type: 'sort';

    /**
     * The column in the data schema to apply the transformation to.
     */
    column: string;

    /**
     * (deprecated)
     * The column in the data schema to apply the transformation to.
     */
    columnIndex?: number;

    /**
     * Indicates if the sort should be performed descending or ascending.
     */
    desc: boolean;
  };

  /**
   * A declarative spec for the `Hide` transformation.
   */
  export type Hide = {
    /**
     * A type alias for this transformation.
     */
    type: 'hide';

    /**
     * The column in the data schema to apply the transformation to.
     */
    column: string;

    /**
     * The column in the data schema to apply the transformation to.
     */
    columnIndex?: number;

    /**
     * Boolean indicating if all columns should be hidden
     */
    hideAll: boolean;
  };

  /**
   * A declarative spec for the `Filter` transformation.
   */
  export type Filter = {
    /**
     * A type alias for this transformation.
     */
    type: 'filter';

    /**
     * The column in the data schema to apply the transformation to.
     */
    column: string;

    /**
     * (deprecated)
     * The column in the data schema to apply the transformation to.
     */
    columnIndex?: number;

    /**
     * The operator for this transformation.
     */
    operator: FilterOperator;

    /**
     * The value(s) to apply for this transformation.
     */
    value: string | string[] | number | number[];
  };

  /**
   * A type to represent valid filter values.
   */
  export type FilterValue = string | string[] | number | number[];

  /**
   * The available operators for this transform.
   */
  export type FilterOperator =
    | '<'
    | '>'
    | '='
    | '<='
    | '>='
    | '!='
    | 'empty'
    | 'notempty'
    | 'in'
    | 'between'
    | 'startswith'
    | 'endswith'
    | 'stringContains'
    | 'contains'
    | '!contains'
    | 'isOnSameDay';
}
