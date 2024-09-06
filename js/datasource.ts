import { Dict } from '@jupyter-widgets/base';

export class DataSource {
  constructor(
    data: Dict<any[]>,
    fields: any[],
    schema: any,
    computeSchema = false,
  ) {
    this._data = { ...data };

    if (computeSchema) {
      this._fields = fields;
      this._schema = this._createSchema(fields, schema);
    } else {
      this._fields = fields;
      this._schema = schema;
    }

    this._columns = Object.keys(this._data);
  }

  get data(): Dict<any[]> {
    return this._data;
  }

  get fields(): any[] {
    return this._fields;
  }

  get schema(): DataSource.ISchema {
    return this._schema;
  }

  get columns(): string[] {
    return this._columns;
  }

  get length(): number {
    if (this._columns.length == 0) {
      return 0;
    }

    return this.data[this._columns[0]].length;
  }

  setColumns(columnNames: string[]) {
    this._columns = columnNames;
  }

  private _createSchema(
    origFields: Dict<any>,
    origSchema: any,
  ): DataSource.ISchema {
    // Construct a new array of schema fields based on the keys in data.fields
    // Note: this accounts for how tuples/lists may be serialized into strings
    // in the case of multiIndex columns.
    const fields: DataSource.IField[] = [];
    origFields.forEach((val: { [key: string]: null }, i: number) => {
      const rows = Array.isArray(origSchema.fields[i].name)
        ? <any[]>origSchema.fields[i].name
        : <string[]>[origSchema.fields[i].name];
      const field = {
        name: Object.keys(val)[0],
        type: origSchema.fields[i].type,
        rows: rows,
      };
      fields.push(field);
    });

    // Updating the primary key to account for a multiIndex primary key.
    const primaryKey = origSchema.primaryKey.map((key: string) => {
      for (let i = 0; i < origSchema.fields.length; i++) {
        const curFieldKey = Array.isArray(key)
          ? origSchema.fields[i].name[0]
          : origSchema.fields[i].name;
        const newKey = Array.isArray(key) ? key[0] : key;

        if (curFieldKey == newKey) {
          return Object.keys(origFields[i])[0];
        }
      }
      return 'unreachable';
    });

    return {
      primaryKey: primaryKey,
      primaryKeyUuid: origSchema.primaryKeyUuid,
      fields: fields,
    };
  }

  private _data: Dict<any[]>;
  private _fields: any[];
  private _schema: DataSource.ISchema;
  private _columns: string[];
}

export namespace DataSource {
  /**
   * An object which describes a column of data in the model.
   *
   * #### Notes
   * This is based on the JSON Table Schema specification:
   * https://specs.frictionlessdata.io/table-schema/
   */
  export interface IField {
    /**
     * The name of the column.
     *
     * This is used as the key to extract a value from a data record.
     */
    readonly name: string;

    /**
     * The type of data held in the column.
     */
    readonly type: string;

    /**
     * An array of the column labels per header row.
     */
    readonly rows: any[];
  }

  export interface ISchema {
    /**
     * The fields which describe the view columns.
     *
     * Primary key fields are rendered as row header columns.
     */
    readonly fields: DataSource.IField[];

    /**
     * The values to treat as "missing" data.
     *
     * Missing values are automatically converted to `null`.
     */
    readonly missingValues?: string[];

    /**
     * The field names which act as primary keys.
     *
     * Primary key fields are rendered as row header columns.
     */
    readonly primaryKey: string | string[];

    /**
     * The name of the unique identifier in the primary key array
     */
    readonly primaryKeyUuid: string;
  }
}
