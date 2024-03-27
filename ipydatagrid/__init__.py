# Copyright (c) Bloomberg.
# Distributed under the terms of the Modified BSD License.

from ._version import __version__
from .cellrenderer import (
    BarRenderer,
    CellRenderer,
    Expr,
    HtmlRenderer,
    HyperlinkRenderer,
    ImageRenderer,
    TextRenderer,
    VegaExpr,
)
from .datagrid import DataGrid, SelectionHelper


def _jupyter_nbextension_paths():
    return [
        {
            "section": "notebook",
            "src": "nbextension",
            "dest": "ipydatagrid",
            "require": "ipydatagrid/extension",
        }
    ]


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "ipydatagrid"}]


__all__ = [
    "__version__",
    "BarRenderer",
    "CellRenderer",
    "Expr",
    "HyperlinkRenderer",
    "ImageRenderer",
    "TextRenderer",
    "HtmlRenderer",
    "VegaExpr",
    "DataGrid",
    "SelectionHelper",
]
