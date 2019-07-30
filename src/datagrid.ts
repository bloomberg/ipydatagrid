// Copyright (c) QuantStack
// Distributed under the terms of the Modified BSD License.

import {
  WidgetModel, DOMWidgetModel, DOMWidgetView, ISerializers, unpack_models
} from '@jupyter-widgets/base';

import {
    Message
} from '@phosphor/messaging';

import {
    Widget
} from '@phosphor/widgets';

import {
  DataGrid
} from '@phosphor/datagrid';

import {
  Transform
} from './core/transform'

import {
  ViewBasedJSONModel
} from './core/viewbasedjsonmodel'

// Import CSS
import '../css/datagrid.css'

import {
  MODULE_NAME, MODULE_VERSION
} from './version';


abstract class TransformModel extends WidgetModel {
  defaults() {
    return {...super.defaults(),
      _model_module: TransformModel.model_module,
      _model_module_version: TransformModel.model_module_version,
      columnIndex: null
    };
  }

  static model_module = MODULE_NAME;
  static model_module_version = MODULE_VERSION;

  abstract transform: Transform.TransformSpec;
}


export
class FilterModel extends TransformModel {
  defaults() {
    return {...super.defaults(),
      _model_name: FilterModel.model_name,
      type: 'filter',
      operator: '<',
      value: null
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);

    this.transform = {
      type: this.get('type'),
      columnIndex: this.get('column_index'),
      operator: this.get('operator'),
      value: this.get('value')
    };
  }

  static model_name = 'FilterModel';

  transform: Transform.Filter;
}


export
class SortModel extends TransformModel {
  defaults() {
    return {...super.defaults(),
      _model_name: SortModel.model_name,
      type: 'sort',
      desc: true
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);

    this.transform = {
      type: this.get('type'),
      columnIndex: this.get('column_index'),
      desc: this.get('desc')
    };
  }

  static model_name = 'SortModel';

  transform: Transform.Sort;
}


export
class DataGridModel extends DOMWidgetModel {
  defaults() {
    return {...super.defaults(),
      _model_module: DataGridModel.model_module,
      _model_module_version: DataGridModel.model_module_version,
      _view_name: DataGridModel.view_name,
      _view_module: DataGridModel.view_module,
      _view_module_version: DataGridModel.view_module_version,
      baseRowSize: 20,
      baseColumnSize: 64,
      baseRowHeaderSize: 64,
      baseColumnHeaderSize: 20,
      headerVisibility: 'all',
      data: {},
      _transforms: []
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);

    this.data_model = new ViewBasedJSONModel(this.get('data'));

    this.on('change:_transforms', this.update_transforms.bind(this));
    this.update_transforms();
  }

  update_transforms() {
    this.data_model.replaceTransforms(this.get('_transforms'));
  }

  static serializers: ISerializers = {
    ...DOMWidgetModel.serializers,
    transforms: { deserialize: (unpack_models as any) }
  }

  static model_name = 'DataGridModel';
  static model_module = MODULE_NAME;
  static model_module_version = MODULE_VERSION;

  static view_name = 'DataGridView';
  static view_module = MODULE_NAME;
  static view_module_version = MODULE_VERSION;

  data_model: ViewBasedJSONModel;
}


export
class DataGridView extends DOMWidgetView {
  render() {
    let greenStripeStyle: DataGrid.IStyle = {
      ...DataGrid.defaultStyle,
      rowBackgroundColor: i => i % 2 === 0 ? 'rgba(64, 115, 53, 0.2)' : ''
    };

    this.grid = new DataGrid({
      style: greenStripeStyle,
      baseRowSize: this.model.get('base_row_size'),
      baseColumnSize: this.model.get('base_column_size'),
      baseRowHeaderSize: this.model.get('base_row_header_size'),
      baseColumnHeaderSize: this.model.get('base_column_header_size'),
      headerVisibility: this.model.get('header_visibility')
    });
    this.grid.model = this.model.data_model;
  }

  processPhosphorMessage(msg: Message) {
    super.processPhosphorMessage(msg);
    switch (msg.type) {
    case 'after-attach':
      Widget.attach(this.grid, this.el);
      break;
    }
  }

  model: DataGridModel;
  grid: DataGrid;
}
