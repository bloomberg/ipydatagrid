# Copyright (c) NumFOCUS.
# Distributed under the terms of the Modified BSD License.

import datetime
import decimal
import warnings
from collections.abc import Iterator
from copy import deepcopy
from math import floor

import numpy as np
import pandas as pd
from bqplot.traits import array_from_json, array_to_json
from ipywidgets import CallbackDispatcher, DOMWidget, widget_serialization
from traitlets import (
    Bool,
    Dict,
    Enum,
    Instance,
    Int,
    List,
    Unicode,
    default,
    validate,
)

from ._frontend import module_name, module_version
from .cellrenderer import BarRenderer, CellRenderer, TextRenderer


class SelectionIterator(Iterator):
    def __init__(self, selections):
        self._rect_index = 0
        self._cell_index = 0
        self._selections = selections

    def __next__(self):
        if self._rect_index >= len(self._selections):
            raise StopIteration

        rect = self._selections[self._rect_index]
        row_col = self._index_to_row_col(rect, self._cell_index)
        self._cell_index += 1

        if row_col is None:
            self._rect_index += 1
            self._cell_index = 0
            return self.__next__()
        elif self._cell_in_previous_selected_rects(row_col):
            return self.__next__()
        else:
            return row_col

    @staticmethod
    def _index_to_row_col(rect, index):
        num_rows = rect["r2"] - rect["r1"] + 1
        num_cols = rect["c2"] - rect["c1"] + 1
        if index > (num_rows * num_cols - 1):
            return None

        return {
            "r": rect["r1"] + floor(index / num_cols),
            "c": rect["c1"] + index % num_cols,
        }

    def _cell_in_previous_selected_rects(self, cell):
        return any(
            self._cell_in_rect(cell, self._selections[i])
            for i in range(0, self._rect_index)
        )

    @staticmethod
    def _cell_in_rect(cell, rect):
        return (
            rect["r1"] <= cell["r"] <= rect["r2"]
            and rect["c1"] <= cell["c"] <= rect["c2"]
        )


class SelectionHelper:
    """A Helper Class for processing selections. Provides an iterator
    to traverse selected cells.
    """

    def __init__(self, data, selections, selection_mode, **kwargs):
        super().__init__(**kwargs)
        self._data = data
        self._selections = selections
        self._selection_mode = selection_mode
        self._num_columns = -1
        self._num_rows = -1

    def __iter__(self):
        selections = [
            self._transform_rect_for_selection_mode(rect)
            for rect in self._selections
        ]
        return SelectionIterator(selections)

    def __len__(self):
        return sum(1 for _ in self)

    def all(self):
        """
        Returns all selected cells as a list. Each cell is
        represented as a dictionary
        with keys 'r': row and 'c': column
        """
        return list(self)

    def all_values(self):
        """
        Returns values for all selected cells as a list.
        """
        return [
            DataGrid._get_cell_value_by_numerical_index(
                self._data, cell["c"], cell["r"]
            )
            for cell in self
        ]

    def _transform_rect_for_selection_mode(self, rect):
        selection_mode = self._selection_mode
        if selection_mode == "row":
            return {
                "r1": rect["r1"],
                "c1": 0,
                "r2": rect["r2"],
                "c2": self._get_num_columns() - 1,
            }
        elif selection_mode == "column":
            return {
                "r1": 0,
                "c1": rect["c1"],
                "r2": self._get_num_rows() - 1,
                "c2": rect["c2"],
            }
        else:
            return rect

    def _get_num_columns(self):
        if self._num_columns != -1:
            return self._num_columns

        data = self._data
        primary_keys = (
            []
            if "primaryKey" not in data["schema"]
            else data["schema"]["primaryKey"]
        )
        col_headers = [
            field["name"]
            for field in data["schema"]["fields"]
            if field["name"] not in primary_keys
        ]
        self._num_columns = len(col_headers)
        return self._num_columns

    def _get_num_rows(self):
        if self._num_rows != -1:
            return self._num_rows

        data = self._data
        self._num_rows = 0 if "data" not in data else len(data["data"])
        return self._num_rows


def _data_to_json(x, _):
    if isinstance(x, dict):
        return {str(k): _data_to_json(v, _) for k, v in x.items()}
    if isinstance(x, np.ndarray):
        return _data_to_json(x.tolist(), _)
    if isinstance(x, (list, tuple)):
        return [_data_to_json(v, _) for v in x]
    if isinstance(x, int):
        return x
    if isinstance(x, float):
        if np.isnan(x):
            return "$NaN$"
        if np.isposinf(x):
            return "$Infinity$"
        if np.isneginf(x):
            return "$NegInfinity$"
        return x
    if isinstance(x, decimal.Decimal):
        return str(x)
    if isinstance(x, (datetime.datetime, datetime.date)):
        return x.isoformat()
    if x is pd.NaT:
        return "$NaT$"
    if pd.isna(x):
        return "$NaN$"
    return str(x)


def _data_serialization_impl(data, _):
    if not data:
        return {}

    serialized_data = {}
    for column, value in data["data"].items():
        arr = value.to_numpy()
        if arr.size == 0:
            serialized_data[str(column)] = {
                "value": [],
                "dtype": str(arr.dtype),
                "shape": arr.shape,
                "type": None,
            }
            continue
        try:
            serialized_data[str(column)] = array_to_json(arr)
        except ValueError:
            # Column is most likely heterogeneous, sending the column raw
            serialized_data[str(column)] = {
                "value": _data_to_json(arr, _),
                "type": "raw",
            }

    return {
        "data": serialized_data,
        "schema": data["schema"],
        "fields": _data_to_json(data["fields"], _),
    }


def _data_deserialization_impl(data, _):  # noqa: U101
    if not data:
        return {}

    deserialized_data = {}
    for column, value in data["data"].items():
        deserialized_data[column] = array_from_json(value.to_numpy())

    return {
        "data": deserialized_data,
        "schema": data["schema"],
        "fields": data["fields"],
    }


_data_serialization = {
    "from_json": _data_deserialization_impl,
    "to_json": _data_serialization_impl,
}


def _widgets_dict_to_json(x, obj):
    return {
        str(k): widget_serialization["to_json"](v, obj) for k, v in x.items()
    }


_widgets_dict_serialization = {
    "from_json": widget_serialization["from_json"],
    "to_json": _widgets_dict_to_json,
}


class DataGrid(DOMWidget):
    """A Grid Widget with filter, sort and selection capabilities.

    Attributes
    ----------
    base_row_size : int (default: 20)
        Default row height
    base_column_size : int (default: 64)
        Default column width
    base_row_header_size : int (default: 64)
        Default row header width
    base_column_header_size : int (default: 20)
        Default column header height
    header_visibility : {'all', 'row', 'column', 'none'} (default: 'all')
        Header visibility mode
        'all': both row and column headers visible
        'row': only row headers visible
        'column': only column headers visible
        'none': neither row and column headers visible
    dataframe : pandas dataframe
        Data to display on Data Grid.
    renderers : dict
        Custom renderers to use for cell rendering. Keys of dictionary specify
        column name, and value specifies the renderer
    default_renderer : CellRenderer (default: TextRenderer)
        Default renderer to use for cell rendering
    header_renderer : CellRenderer (default: TextRenderer)
        Renderer to use for header cell rendering
    corner_renderer : CellRenderer (default: TextRenderer)
        Renderer to use for corner header cell rendering
    selection_mode : {'row', 'column', 'cell', 'none'} (default: 'none')
        Selection mode used when user clicks on grid or makes selections
        programmatically.
        'row': Selecting a cell will select all the cells on the same row
        'column': Selecting a cell will select all the cells on the same column
        'cell': Individual cell selection
        'none': Selection disabled
    selections : list of dict
        List of all selections. Selections are represented as rectangular
        regions. Rectangles are defined as dictionaries with keys:
        'r1': start row, 'c1': start column, 'r2': end row, 'c2': end column.
        Start of rectangle is top-left corner and end is bottom-right corner
    editable : boolean (default: false)
        Boolean indicating whether cell grid can be directly edited
    column_widths : Dict of strings to int (default: {})
        Dict to specify custom column sizes
        The keys (strings) indicate the names of the columns
        The values (integers) indicate the widths
    auto_fit_columns : Bool (default: False)
        Specify whether column width should automatically be
        determined by the grid
    auto_fit_params : Dict. Specify column auto fit parameters.
        Supported parameters:
        1) area: where to resize column widths - 'row-header',
                'body' or 'all' (default)
        2) padding: add padding to resized column widths (15 pixels by default)
        3) numCols: cap the number of columns to be resized (None)
    grid_style : Dict of {propertyName: string | VegaExpr | Dict}
        Dict to specify global grid styles.
        The keys (strings) indicate the styling property
        The values (css color properties or Vega Expression) indicate the values
        See below for all supported styling properties
    index_name : str (default: "key")
        String to specify the index column name. **Only set when the grid
        is constructed and is not an observable traitlet**
    horizontal_stripes : bool (default: False)
        Enable themed coloring of alternate grid rows
    vertical_stripes : bool (default: False)
        Enable themed coloring of alternate grid columns

    Accessors (not observable traitlets)
    ---------
    selected_cells : list of dict
        List of selected cells. Each cell is represented as a dictionary
        with keys 'r': row and 'c': column
    selected_cell_values : list
        List of values for all selected cells.
    selected_cell_iterator : iterator
        An iterator to traverse selected cells one by one.

    Supported styling properties:
        void_color : color of the area where the grid is not painted
            on the canvas
        background_color : background color for all body cells
        row_background_color : row-wise background color (can take
            a string or Vega Expression)
        column_background_color : column-wise background color (can take a
            string of Vega Expression)
        grid_line_color : color of both vertical and horizontal grid lines
        vertical_grid_line_color : vertical grid line color
        horizontal_grid_line_color : horizontal grid line color
        header_background_color : background color for all non-body cells
            (index and columns)
        header_grid_line_color : grid line color for all non-body
            cells (index and columns)
        header_vertical_grid_line_color : vertical grid line color
            for all non-body cells
        header_horizontal_grid_line_color : horizontal grid line color
            for all non-body cells
        selection_fill_color : fill color of selected area
        selection_border_color : border color of selected area
        header_selection_fill_color : fill color of headers intersecting with
            selected area at column or row
        header_selection_border_color : border color of headers
            intersecting with selected area at column or row
        cursor_fill_color : fill color of cursor
        cursor_border_color : border color of cursor
        scroll_shadow : Dict of color parameters for scroll shadow (vertical and
            horizontal). Takes three parameters:
            size : size of shadow in pixels
            color1 : gradient color 1
            color2 : gradient color 2
            color3 : gradient color 3
    """

    _model_name = Unicode("DataGridModel").tag(sync=True)
    _model_module = Unicode(module_name).tag(sync=True)
    _model_module_version = Unicode(module_version).tag(sync=True)
    _view_name = Unicode("DataGridView").tag(sync=True)
    _view_module = Unicode(module_name).tag(sync=True)
    _view_module_version = Unicode(module_version).tag(sync=True)

    base_row_size = Int(20).tag(sync=True)
    base_column_size = Int(64).tag(sync=True)
    base_row_header_size = Int(64).tag(sync=True)
    base_column_header_size = Int(20).tag(sync=True)

    header_visibility = Enum(
        default_value="all", values=["all", "row", "column", "none"]
    ).tag(sync=True)

    _transforms = List(Dict()).tag(sync=True, **widget_serialization)
    _visible_rows = List(Int()).tag(sync=True)
    _data = Dict().tag(sync=True, **_data_serialization)

    renderers = Dict(Instance(CellRenderer)).tag(
        sync=True, **_widgets_dict_serialization
    )
    default_renderer = Instance(CellRenderer).tag(
        sync=True, **widget_serialization
    )
    header_renderer = Instance(CellRenderer, allow_none=True).tag(
        sync=True, **widget_serialization
    )
    corner_renderer = Instance(CellRenderer, allow_none=True).tag(
        sync=True, **widget_serialization
    )
    selection_mode = Enum(
        default_value="none", values=["row", "column", "cell", "none"]
    ).tag(sync=True)
    selections = List(Dict()).tag(sync=True)
    editable = Bool(False).tag(sync=True)
    column_widths = Dict({}).tag(sync=True, to_json=_data_to_json)
    grid_style = Dict(allow_none=True).tag(
        sync=True, **_widgets_dict_serialization
    )
    auto_fit_columns = Bool(False).tag(sync=True)
    auto_fit_params = Dict(
        {"area": "all", "padding": 30, "numCols": None}, allow_none=False
    ).tag(sync=True)
    horizontal_stripes = Bool(False).tag(sync=True)
    vertical_stripes = Bool(False).tag(sync=True)

    def __init__(self, dataframe, index_name=None, **kwargs):
        # Setting default index name if not explicitly
        # set by the user.
        self._index_name = index_name
        self.data = dataframe
        super().__init__(**kwargs)
        self._cell_click_handlers = CallbackDispatcher()
        self._cell_change_handlers = CallbackDispatcher()
        self.on_msg(self.__handle_custom_msg)
        self._set_renderer_defaults()

    def __handle_custom_msg(self, _, content, buffers):  # noqa: U101,U100
        if content["event_type"] == "cell-changed":
            row = content["row"]
            column = self._column_index_to_name(
                self._data, content["column_index"]
            )
            value = content["value"]
            # update data on kernel
            self._data["data"].loc[row, column] = value
            # notify python listeners
            self._cell_change_handlers(
                {
                    "row": row,
                    "column": column,
                    "column_index": content["column_index"],
                    "value": value,
                }
            )
        elif content["event_type"] == "cell-click":
            # notify python listeners
            self._cell_click_handlers(
                {
                    "region": content["region"],
                    "column": content["column"],
                    "column_index": content["column_index"],
                    "row": content["row"],
                    "primary_key_row": content["primary_key_row"],
                    "cell_value": content["cell_value"],
                }
            )

    @property
    def data(self):
        trimmed_primary_key = self._data["schema"]["primaryKey"][:-1]
        if "data" in self._data:
            df = pd.DataFrame(self._data["data"])
        else:
            df = pd.DataFrame(
                {value["name"]: [] for value in self._data["schema"]["fields"]}
            )
        final_df = df.set_index(trimmed_primary_key)
        final_df = final_df[final_df.columns[:-1]]
        final_df.drop(columns=["ipydguuid"], inplace=True, errors="ignore")
        return final_df

    @data.setter
    def data(self, dataframe):
        # Reference for the original frame column and index names
        # This is used to when returning the view data model
        self.__dataframe_reference_index_names = dataframe.index.names
        self.__dataframe_reference_columns = dataframe.columns
        dataframe = dataframe.copy()

        # Primary key used
        index_key = self.get_dataframe_index(dataframe)

        self._data = self.generate_data_object(
            dataframe, "ipydguuid", index_key
        )

    @staticmethod
    def generate_data_object(dataframe, guid_key="ipydguuid", index_name="key"):
        dataframe[guid_key] = pd.RangeIndex(0, dataframe.shape[0])

        # Renaming default index name from 'index' to 'key' on
        # single index DataFrames. This allows users to use
        # 'index' as a column name. If 'key' exists, we add _x
        # suffix to id, where { x | 0 <= x < inf }
        if not isinstance(dataframe.index, pd.MultiIndex):
            if index_name in dataframe.columns:
                index = 0
                new_index_name = f"{index_name}_{index}"
                while new_index_name in dataframe.columns:
                    index += 1
                    new_index_name = f"{index_name}_{index}"
                dataframe = dataframe.rename_axis(new_index_name)
            else:
                dataframe = dataframe.rename_axis(index_name)

        schema = pd.io.json.build_table_schema(dataframe)
        reset_index_dataframe = dataframe.reset_index()
        data = reset_index_dataframe

        # Check for multiple primary keys
        key = reset_index_dataframe.columns[: dataframe.index.nlevels].tolist()

        num_index_levels = len(key) if isinstance(key, list) else 1

        # Check for nested columns in schema, if so, we need to update the
        # schema to represent the actual column name values
        if isinstance(schema["fields"][-1]["name"], tuple):
            num_column_levels = len(dataframe.columns.levels)
            primary_key = key.copy()

            for i in range(num_index_levels):
                new_name = [""] * num_column_levels
                new_name[0] = schema["fields"][i]["name"]
                schema["fields"][i]["name"] = tuple(new_name)
                primary_key[i] = tuple(new_name)

            schema["primaryKey"] = primary_key
            uuid_pk = list(key[-1])
            uuid_pk[0] = guid_key
            schema["primaryKey"].append(tuple(uuid_pk))

        else:
            schema["primaryKey"] = key
            schema["primaryKey"].append(guid_key)

        schema["primaryKeyUuid"] = guid_key

        return {
            "data": data,
            "schema": schema,
            "fields": [{field["name"]: None} for field in schema["fields"]],
        }

    def get_dataframe_index(self, dataframe):
        """Returns a primary key to be used in ipydatagrid's
        view of the passed DataFrame"""

        # Passed index_name takes highest priority
        if self._index_name is not None:
            return self._index_name

        # Dataframe with names index used by default
        if dataframe.index.name is not None:
            return dataframe.index.name

        # If no index_name param, nor named-index DataFrame
        # have been passed, revert to default "key"
        return "key"

    def get_cell_value(self, column_name, primary_key_value):
        """Gets the value for a single or multiple cells by column name and
         index name.

        Tuples should be used to index into multi-index columns."""
        row_indices = self._get_row_index_of_primary_key(primary_key_value)

        if isinstance(column_name, list):
            column_name = tuple(column_name)

        return [self._data["data"][column_name][row] for row in row_indices]

    def set_cell_value(self, column_name, primary_key_value, new_value):
        """Sets the value for a single cell by column name and primary key.

        Note: This method returns a boolean to indicate if the operation
        was successful.
        """
        row_indices = self._get_row_index_of_primary_key(primary_key_value)
        # Bail early if key could not be found
        if not row_indices:
            return False

        if isinstance(column_name, list):
            column_name = tuple(column_name)

        # Iterate over all indices
        outcome = True
        for row_index in row_indices:
            has_column = column_name in self._data["data"]
            if has_column and row_index is not None:
                self._data["data"].loc[row_index, column_name] = new_value
                self._notify_cell_change(row_index, column_name, new_value)
            else:
                outcome = False
        return outcome

    def set_row_value(self, primary_key_value, new_value):
        """Sets the value for a row by and primary key.

        Note: This method returns a boolean to indicate if the operation
        was successful.
        """
        row_indices = self._get_row_index_of_primary_key(primary_key_value)
        # Bail early if key could not be found
        if not row_indices:
            return False

        # Iterate over all indices
        for row_index in row_indices:
            column_index = 0
            column = DataGrid._column_index_to_name(self._data, column_index)
            while column is not None:
                self._data["data"].loc[row_index, column] = new_value[
                    column_index
                ]

                column_index = column_index + 1
                column = DataGrid._column_index_to_name(
                    self._data, column_index
                )

            self._notify_row_change(row_index, new_value)
        return True

    def get_cell_value_by_index(self, column_name, row_index):
        """Gets the value for a single cell by column name and row index."""
        return self._data["data"][column_name][row_index]

    def set_cell_value_by_index(self, column_name, row_index, new_value):
        """Sets the value for a single cell by column name and row index.

        Note: This method returns a boolean to indicate if the operation
        was successful.
        """
        has_column = column_name in self._data["data"]
        if has_column and 0 <= row_index < len(self._data["data"][column_name]):
            self._data["data"].loc[row_index, column_name] = new_value
            self._notify_cell_change(row_index, column_name, new_value)
            return True
        return False

    def _notify_cell_change(self, row, column, value):
        column_index = self._column_name_to_index(column)
        # notify python listeners
        self._cell_change_handlers(
            {
                "row": row,
                "column": column,
                "column_index": column_index,
                "value": value,
            }
        )
        # notify front-end
        self.comm.send(
            data={
                "method": "custom",
                "content": {
                    "event_type": "cell-changed",
                    "row": row,
                    "column": column,
                    "column_index": column_index,
                    "value": value,
                },
            }
        )

    def _notify_row_change(self, row, value):
        # notify front-end
        self.comm.send(
            data={
                "method": "custom",
                "content": {
                    "event_type": "row-changed",
                    "row": row,
                    "value": value,
                },
            }
        )

    def get_visible_data(self):
        """Returns a dataframe of the current View."""
        data = deepcopy(self._data)
        if self._visible_rows:
            data["data"] = data["data"].reindex(self._visible_rows)

        at = self._data["schema"]["primaryKey"]
        return_df = pd.DataFrame(data["data"]).set_index(at)
        return_df.index = return_df.index.droplevel(return_df.index.nlevels - 1)
        return_df.index.names = self.__dataframe_reference_index_names
        return_df.columns = self.__dataframe_reference_columns
        return return_df

    def transform(self, transforms):
        """Apply a list of transformation to this DataGrid."""
        # TODO: Validate this input, or let it fail on view side?
        self._transforms = transforms

    def revert(self):
        """Revert all transformations."""
        self._transforms = []

    @default("default_renderer")
    def _default_renderer(self):
        return TextRenderer()

    def clear_selection(self):
        """Clears all selections."""
        self.selections.clear()
        self.send_state("selections")

    def select(self, row1, column1, row2=None, column2=None, clear_mode="none"):
        """
        Select an individual cell or rectangular cell region.
        Parameters
        ----------
        row1 : int
            Row index for individual cell selection or
            start row index for rectangular region selection.
        column1 : int
            Column index for individual cell selection or
            start column index for rectangular region selection.
        row2 : int or None, optional (default: None)
            End row index for rectangular region selection.
        column2 : int or None, optional (default: None)
            End column index for rectangular region selection.
        clear_mode : string, optional, {'all', 'current', 'none'}
                    (default: 'none')
            Clear mode to use when there are pre-existing selections.
            'all' removes all pre-existing selections
            'current' removes last pre-existing selection
            'none' keeps pre-existing selections
        """
        if row2 is None or column2 is None:
            row2, column2 = row1, column1

        if clear_mode == "all":
            self.selections.clear()
        elif clear_mode == "current" and len(self.selections) > 0:
            self.selections.pop()

        self.selections.append(
            {
                "r1": min(row1, row2),
                "c1": min(column1, column2),
                "r2": max(row1, row2),
                "c2": max(column1, column2),
            }
        )
        self.send_state("selections")

    @property
    def selected_cells(self):
        """
        List of selected cells. Each cell is represented as a dictionary
        with keys 'r': row and 'c': column
        """
        return SelectionHelper(
            self._data, self.selections, self.selection_mode
        ).all()

    @property
    def selected_visible_cell_iterator(self):
        """
        An iterator to traverse selected visible cells one by one.
        """
        # Copy of the front-end data model
        view_data = self.get_visible_data()

        # Get primary key from dataframe
        index_key = self.get_dataframe_index(view_data)

        # Serielize to JSON table schema
        view_data_object = self.generate_data_object(
            view_data, "ipydguuid", index_key
        )
        return SelectionHelper(
            view_data_object, self.selections, self.selection_mode
        )

    @property
    def selected_cell_values(self):
        """
        List of values for all selected cells.
        """
        return self.selected_visible_cell_iterator.all_values()

    @property
    def selected_cell_iterator(self):
        """
        An iterator to traverse selected cells one by one.
        """
        return SelectionHelper(self._data, self.selections, self.selection_mode)

    @validate("selections")
    def _validate_selections(self, proposal):
        selections = proposal["value"]

        for rectangle in selections:
            r1 = min(rectangle["r1"], rectangle["r2"])
            c1 = min(rectangle["c1"], rectangle["c2"])
            r2 = max(rectangle["r1"], rectangle["r2"])
            c2 = max(rectangle["c1"], rectangle["c2"])
            rectangle["r1"] = r1
            rectangle["c1"] = c1
            rectangle["r2"] = r2
            rectangle["c2"] = c2

        return selections

    @validate("editable")
    def _validate_editable(self, proposal):
        value = proposal["value"]
        if value and self.selection_mode == "none":
            self.selection_mode = "cell"
        return value

    @validate("_transforms")
    def _validate_transforms(self, proposal):
        transforms = proposal["value"]
        field_len = len(self._data["schema"]["fields"])
        for transform in transforms:
            if "columnIndex" in transform:
                warnings.warn(
                    "Applying transforms on columnIndex is deprecated, "
                    "please provide the column name instead",
                    DeprecationWarning,
                    stacklevel=4,
                )

                if "column" not in transform:
                    transform["column"] = self._data["schema"]["fields"][
                        transform["columnIndex"]
                    ]["name"]

                if transform["columnIndex"] > field_len:
                    raise ValueError("Column index is out of bounds.")

        return transforms

    @validate("_data")
    def _validate_data(self, proposal):
        table_schema = proposal["value"]
        column_list = [f["name"] for f in table_schema["schema"]["fields"]]
        if len(column_list) != len(set(column_list)):
            msg = "The dataframe must not contain duplicate column names."
            raise ValueError(msg)
        return table_schema

    def on_cell_change(self, callback, remove=False):
        """Register a callback to execute when a cell value changed.

        The callback will be called with one argument, the dictionary
        containing cell information with keys
        "row", "column", "column_index", "value".

        Parameters
        ----------
        remove: bool (optional)
            Set to true to remove the callback from the list of callbacks.
        """
        self._cell_change_handlers.register_callback(callback, remove=remove)

    def on_cell_click(self, callback, remove=False):
        """Register a callback to execute when a cell is clicked.

        The callback will be called with one argument, the dictionary
        containing cell information with following keys:
          "region", "column", "column_index", "row", "primary_key_row",
          "cell_value"

        Parameters
        ----------
        remove: bool (optional)
            Set to true to remove the callback from the list of callbacks.
        """
        self._cell_click_handlers.register_callback(callback, remove=remove)

    @staticmethod
    def _column_index_to_name(data, column_index):
        if "schema" not in data or "fields" not in data["schema"]:
            return None
        col_headers = DataGrid._get_col_headers(data)
        return (
            None
            if len(col_headers) <= column_index
            else col_headers[column_index]
        )

    @staticmethod
    def _get_col_headers(data):
        primary_keys = (
            []
            if "primaryKey" not in data["schema"]
            else data["schema"]["primaryKey"]
        )
        col_headers = [
            field["name"]
            for field in data["schema"]["fields"]
            if field["name"] not in primary_keys
        ]
        return col_headers

    def _column_name_to_index(self, column_name):
        if "schema" not in self._data or "fields" not in self._data["schema"]:
            return None
        col_headers = self._get_col_headers(self._data)
        try:
            return col_headers.index(column_name)
        except ValueError:
            pass

    def _get_row_index_of_primary_key(self, value):
        value = value if isinstance(value, list) else [value]
        schema = self._data["schema"]
        key = schema["primaryKey"][:-1]  # Omitting ipydguuid
        if len(value) != len(key):
            raise ValueError(
                "The provided primary key value must be the same length "
                "as the primary key."
            )

        df = self._data["data"]
        return pd.RangeIndex(len(df))[
            (df[key] == value).all(axis="columns")
        ].to_list()

    @staticmethod
    def _get_cell_value_by_numerical_index(data, column_index, row_index):
        """Gets the value for a single cell by column index and row index."""
        # TODO This is really not efficient, we should speed it up
        column = DataGrid._column_index_to_name(data, column_index)
        if column is None:
            return None
        return data["data"].loc[row_index, column]

    def _set_renderer_defaults(self):
        # Set sensible default values for renderers that are not completely
        # specified, such as missing a min or max value.

        data = None  # Only read data once, and only if necessary.

        for name, renderer in self.renderers.items():
            if isinstance(renderer, BarRenderer):
                from bqplot import DateScale, LinearScale, Scale

                if renderer.bar_value is None:
                    # If BarRenderer.bar_value is not specified, create an
                    # appropriate Scale based on the column data type.
                    col_schema = next(
                        filter(
                            lambda x: x["name"] == name,
                            self._data["schema"]["fields"],
                        )
                    )
                    is_date = col_schema["type"] in ("date", "time", "datetime")
                    if is_date:
                        renderer.bar_value = DateScale()
                    else:
                        renderer.bar_value = LinearScale()

                scale = renderer.bar_value
                if (
                    isinstance(scale, Scale)
                    and scale.has_trait("min")
                    and scale.has_trait("max")
                    and (scale.min is None or scale.max is None)
                ):
                    # Set min and/or max from column data.
                    if data is None:
                        data = self.data  # Only want to get the data once
                    column_data = data[name]
                    is_date = isinstance(scale, DateScale)
                    if scale.min is None:
                        min = column_data.min()
                        scale.min = min if is_date else float(min)
                    if scale.max is None:
                        max = column_data.max()
                        scale.max = max if is_date else float(max)


class StreamingDataGrid(DataGrid):
    """A blazingly fast Grid Widget.
    This widget needs a live kernel for working
    (does not work when embedded in static HTML)
    """

    _model_name = Unicode("StreamingDataGridModel").tag(sync=True)
    _view_name = Unicode("StreamingDataGridView").tag(sync=True)

    _row_count = Int(0).tag(sync=True)
    _debounce_delay = Int(160).tag(sync=True)

    def __init__(self, *args, debounce_delay=160, **kwargs):
        super().__init__(*args, **kwargs)

        self._debounce_delay = debounce_delay

        self.on_msg(self._handle_comm_msg)

    def transform(self, _):
        # TODO Implement sorting and filtering backend-side?
        raise RuntimeError(
            "Setting filters and sorting rules to a "
            "StreamingDataGrid is not supported."
        )

    @property
    def data(self):
        return super().data

    @data.setter
    def data(self, dataframe):
        self.__dataframe_reference_index_names = dataframe.index.names
        self.__dataframe_reference_columns = dataframe.columns
        # Not making a copy in the streaming grid
        self.__dataframe_reference = dataframe

        # Primary key used
        index_key = self.get_dataframe_index(dataframe)

        self._data_object = self.generate_data_object(
            dataframe, "ipydguuid", index_key
        )

        self._row_count = len(self._data_object["data"])

        self._data = {
            "data": {},
            "schema": self._data_object["schema"],
            "fields": self._data_object["fields"],
        }

    def tick(self):
        """Notify that the underlying dataframe has changed."""
        self.send({"event_type": "tick"})

    def _handle_comm_msg(self, _, content, _buffs):
        event_type = content.get("type", "")

        if event_type == "data-request":
            r1 = content.get("r1")
            r2 = content.get("r2")
            c1 = content.get("c1")
            c2 = content.get("c2")

            value = self.__dataframe_reference.iloc[r1 : r2 + 1, c1 : c2 + 1]

            # Primary key used
            index_key = self.get_dataframe_index(value)

            serialized = _data_serialization_impl(
                self.generate_data_object(value, "ipydguuid", index_key), None
            )

            # Extract all buffers
            buffers = []
            for column in serialized["data"].keys():
                if (
                    not isinstance(serialized["data"][column], list)
                    and not serialized["data"][column]["type"] == "raw"
                ):
                    buffers.append(serialized["data"][column]["value"])
                    serialized["data"][column]["value"] = len(buffers) - 1

            answer = {
                "event_type": "data-reply",
                "value": serialized,
                "r1": r1,
                "r2": r2,
                "c1": c1,
                "c2": c2,
            }

            self.send(answer, buffers)
