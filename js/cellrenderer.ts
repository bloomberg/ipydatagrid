// Copyright (c) Bloomberg
// Distributed under the terms of the Modified BSD License.

const d3Format: any = require('d3-format');
const d3TimeFormat: any = require('d3-time-format');

import {
  AsyncCellRenderer,
  CellRenderer,
  HyperlinkRenderer,
  ImageRenderer,
  TextRenderer,
} from '@lumino/datagrid';

import {
  Dict,
  ISerializers,
  WidgetModel,
  WidgetView,
  resolvePromisesDict,
  unpack_models,
} from '@jupyter-widgets/base';

import { MODULE_NAME, MODULE_VERSION } from './version';

import { BarRenderer } from './core/barrenderer';

import { VegaExprView } from './vegaexpr';

import { HtmlRenderer, exportedClass } from './core/htmlRenderer';
import { Scalar, Theme } from './utils';

// Temporary, will be removed when the scales are exported from bqplot
type Scale = any;

type Processor = Scalar | VegaExprView | Scale;

interface ICellRendererAttribute {
  // The name of the widget attribute
  name: string;

  // The name of the equivalent phosphor attribute, if null the CellRenderer attribute has no equivalent in phosphor
  phosphorName: string | null;

  // The default value for this attribute
  defaultValue: Scalar;
}

export abstract class CellRendererModel extends WidgetModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: CellRendererModel.model_name,
      _model_module: CellRendererModel.model_module,
      _model_module_version: CellRendererModel.model_module_version,
      _view_name: CellRendererModel.view_name,
      _view_module: CellRendererModel.view_module,
      _view_module_version: CellRendererModel.view_module_version,
    };
  }

  abstract get_attrs(): ICellRendererAttribute[];

  static model_name = 'CellRendererModel';
  static model_module = MODULE_NAME;
  static model_module_version = MODULE_VERSION;
  static view_name = 'CellRendererView';
  static view_module = MODULE_NAME;
  static view_module_version = MODULE_VERSION;
}

export abstract class CellRendererView extends WidgetView {
  async render() {
    await this.initializeRenderer();

    this.updateRenderer();

    this.on('renderer-needs-update', this.updateRenderer.bind(this));
  }

  /**
   * Method that should be called when the theme has changed.
   */
  async onThemeChanged() {
    await this.initializeRenderer();
    return this.updateRenderer();
  }

  /**
   * Initialize the CellRenderer widget.
   *
   * @return The promise to initialize the renderer
   */
  protected async initializeRenderer(): Promise<any> {
    const promises: Dict<PromiseLike<Processor>> = {};
    const attr_names = this.model
      .get_attrs()
      .map((attr: ICellRendererAttribute) => {
        return attr.name;
      });

    this.model.on_some_change(
      attr_names,
      this._on_some_processors_change,
      this,
    );

    for (const name of attr_names) {
      promises[name] = this.updateProcessor(name);
    }

    this.processors = await resolvePromisesDict(promises);
  }

  private _on_some_processors_change(event: any) {
    const promises: Dict<PromiseLike<Processor>> = {};

    for (const name in event.changed) {
      promises[name] = this.updateProcessor(name);
    }

    resolvePromisesDict(promises).then((processors: Dict<Processor>) => {
      this.processors = {
        ...this.processors,
        ...processors,
      };

      this.trigger('renderer-needs-update');
    });
  }

  /**
   * Update the phosphor renderer value, and trigger an event so that the DataGrid widget knows it has
   * changed.
   */
  private updateRenderer() {
    const options: any = {};
    for (const attr of this.model.get_attrs()) {
      if (attr.phosphorName) {
        options[attr.phosphorName] = (config: CellRenderer.CellConfig) => {
          return this.process(attr.name, config, attr.defaultValue);
        };
      }
    }

    this.renderer = this.createRenderer(options);

    this.trigger('renderer-changed');
  }

  /**
   * Update the processor associated with the given name.
   *
   * @param name - The name of the attribute to process.
   *
   * @return The PromiseLike to update the processor view.
   */
  protected updateProcessor(name: string): any {
    const processor: any = this.model.get(name);

    if (Scalar.isScalar(processor)) {
      return processor;
    }

    // Assuming it is an VegaExprModel or a Scale model
    this.listenTo(processor, 'change', () => {
      this.trigger('renderer-needs-update');
    });

    return this.create_child_view(processor);
  }

  /**
   * Process a cell attribute given the cell config.
   *
   * @param name - The name of the attribute to process.
   *
   * @param config - The configuration data for the cell.
   *
   * @param defaultValue - The default attribute value.
   */
  protected process(
    name: string,
    config: CellRenderer.CellConfig,
    defaultValue: Scalar,
  ): any {
    const processor = this.processors[name];

    if (Scalar.isScalar(processor)) {
      if (
        name === 'font' &&
        typeof processor === 'string' &&
        ((typeof config.value === 'number' && !Number.isFinite(config.value)) ||
          (config.value instanceof Date &&
            Number.isNaN(config.value.getTime())))
      ) {
        return `italic ${processor}`;
      }
      return processor;
    }

    if (processor instanceof VegaExprView) {
      return processor.process(config, defaultValue);
    }

    // If it's a DateScale, convert the value to a Date object
    if (
      processor.model.type == 'date' ||
      processor.model.type == 'date_color_linear'
    ) {
      return processor.scale(new Date(config.value));
    }

    // Assuming it is a Scale view
    return processor.scale(config.value);
  }

  protected abstract createRenderer(
    options: TextRenderer.IOptions,
  ): CellRenderer;

  model: CellRendererModel;

  renderer: CellRenderer;

  processors: Dict<Processor> = {};
}

export class TextRendererModel extends CellRendererModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: TextRendererModel.model_name,
      _view_name: TextRendererModel.view_name,
      font: '12px sans-serif',
      text_color: null,
      text_wrap: false,
      text_elide_direction: 'right',
      text_value: null,
      background_color: null,
      vertical_alignment: 'center',
      horizontal_alignment: 'left',
      format: null,
      format_type: 'number',
      missing: '',
    };
  }

  get_attrs(): ICellRendererAttribute[] {
    return [
      { name: 'font', phosphorName: 'font', defaultValue: '12px sans-serif' },
      { name: 'text_wrap', phosphorName: 'wrapText', defaultValue: false },
      {
        name: 'text_elide_direction',
        phosphorName: 'elideDirection',
        defaultValue: 'right',
      },
      {
        name: 'text_color',
        phosphorName: 'textColor',
        defaultValue: Theme.getFontColor(),
      },
      { name: 'text_value', phosphorName: null, defaultValue: null },
      {
        name: 'background_color',
        phosphorName: 'backgroundColor',
        defaultValue: Theme.getBackgroundColor(),
      },
      {
        name: 'vertical_alignment',
        phosphorName: 'verticalAlignment',
        defaultValue: 'center',
      },
      {
        name: 'horizontal_alignment',
        phosphorName: 'horizontalAlignment',
        defaultValue: 'left',
      },
      { name: 'format', phosphorName: null, defaultValue: null },
    ];
  }

  static serializers: ISerializers = {
    ...CellRendererModel.serializers,
    font: { deserialize: unpack_models as any },
    text_color: { deserialize: unpack_models as any },
    text_wrap: { deserialize: unpack_models as any },
    text_elide_direction: { deserialize: unpack_models as any },
    text_value: { deserialize: unpack_models as any },
    background_color: { deserialize: unpack_models as any },
    vertical_alignment: { deserialize: unpack_models as any },
    horizontal_alignment: { deserialize: unpack_models as any },
    format: { deserialize: unpack_models as any },
  };

  static model_name = 'TextRendererModel';
  static view_name = 'TextRendererView';
}

export class TextRendererView extends CellRendererView {
  render() {
    return super.render().then(() => {
      this.model.on_some_change(
        ['missing', 'format_type'],
        () => {
          this.trigger('renderer-needs-update');
        },
        this,
      );
    });
  }

  createRenderer(options: TextRenderer.IOptions) {
    return new TextRenderer({
      ...options,
      format: this.getFormatter(),
    });
  }

  getFormatter(
    options: TextRenderer.formatGeneric.IOptions = {},
  ): TextRenderer.FormatFunc {
    return (config: CellRenderer.CellConfig) => {
      let formattedValue: string;

      if (config.value === null) {
        formattedValue = this.model.get('missing');
      } else {
        const formattingRule = this.process('format', config, null);

        if (formattingRule === null) {
          formattedValue = String(config.value);
        } else {
          if (this.model.get('format_type') == 'time') {
            formattedValue = String(
              d3TimeFormat.timeFormat(formattingRule)(new Date(config.value)),
            );
          } else {
            formattedValue = String(
              d3Format.format(formattingRule)(config.value),
            );
          }
        }
      }

      return (
        this.process('text_value', config, formattedValue) || formattedValue
      );
    };
  }

  renderer: TextRenderer;

  model: TextRendererModel;
}

export class BarRendererModel extends TextRendererModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: BarRendererModel.model_name,
      _view_name: BarRendererModel.view_name,
      bar_color: '#4682b4',
      bar_value: 0,
      orientation: 'horizontal',
      bar_vertical_alignment: 'bottom',
      bar_horizontal_alignment: 'left',
      show_text: true,
    };
  }

  get_attrs(): ICellRendererAttribute[] {
    return super.get_attrs().concat([
      { name: 'bar_color', phosphorName: 'barColor', defaultValue: '#4682b4' },
      { name: 'bar_value', phosphorName: 'barValue', defaultValue: 0 },
      {
        name: 'orientation',
        phosphorName: 'orientation',
        defaultValue: 'horizontal',
      },
      {
        name: 'bar_vertical_alignment',
        phosphorName: 'barVerticalAlignment',
        defaultValue: 'bottom',
      },
      {
        name: 'bar_horizontal_alignment',
        phosphorName: 'barHorizontalAlignment',
        defaultValue: 'left',
      },
      { name: 'show_text', phosphorName: 'showText', defaultValue: true },
    ]);
  }

  static serializers: ISerializers = {
    ...TextRendererModel.serializers,
    bar_color: { deserialize: unpack_models as any },
    bar_value: { deserialize: unpack_models as any },
    orientation: { deserialize: unpack_models as any },
    bar_vertical_alignment: { deserialize: unpack_models as any },
    bar_horizontal_alignment: { deserialize: unpack_models as any },
    show_text: { deserialize: unpack_models as any },
  };

  static model_name = 'BarRendererModel';
  static view_name = 'BarRendererView';
}

export class BarRendererView extends TextRendererView {
  createRenderer(options: BarRenderer.IOptions) {
    return new BarRenderer({
      ...options,
      format: this.getFormatter(),
    });
  }

  renderer: BarRenderer;

  model: BarRendererModel;
}

export class HyperlinkRendererModel extends TextRendererModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: BarRendererModel.model_name,
      _view_name: BarRendererModel.view_name,
      url: {},
      url_name: {},
    };
  }

  get_attrs(): ICellRendererAttribute[] {
    return super.get_attrs().concat([
      { name: 'url', phosphorName: 'url', defaultValue: null },
      { name: 'url_name', phosphorName: 'urlName', defaultValue: null },
    ]);
  }

  static serializers: ISerializers = {
    ...TextRendererModel.serializers,
    url: { deserialize: unpack_models as any },
    url_name: { deserialize: unpack_models as any },
  };

  static model_name = 'HyperlinkRendererModel';
  static view_name = 'HyperlinkRendererView';
}

export class HyperlinkRendererView extends TextRendererView {
  createRenderer(options: HyperlinkRenderer.IOptions) {
    return new HyperlinkRenderer({
      ...options,
      format: this.getFormatter(),
    });
  }

  renderer: HyperlinkRenderer;

  model: HyperlinkRendererModel;
}

export class ImageRendererModel extends CellRendererModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: ImageRendererModel.model_name,
      _view_name: ImageRendererModel.view_name,
      background_color: {},
      placeholder: {},
      text_color: {},
      width: {},
      height: {},
    };
  }

  get_attrs(): ICellRendererAttribute[] {
    return [
      {
        name: 'background_color',
        phosphorName: 'backgroundColor',
        defaultValue: '',
      },
      { name: 'placeholder', phosphorName: 'placeholder', defaultValue: '...' },
      {
        name: 'text_color',
        phosphorName: 'textColor',
        defaultValue: '#000000',
      },
      { name: 'width', phosphorName: 'width', defaultValue: '' },
      { name: 'height', phosphorName: 'height', defaultValue: '100%' },
    ];
  }

  static serializers: ISerializers = {
    ...TextRendererModel.serializers,
    background_color: { deserialize: unpack_models as any },
    placeholder: { deserialize: unpack_models as any },
    text_color: { deserialize: unpack_models as any },
    width: { deserialize: unpack_models as any },
    height: { deserialize: unpack_models as any },
  };

  static model_name = 'ImageRendererModel';
  static view_name = 'ImageRendererView';
}

export class ImageRendererView extends CellRendererView {
  createRenderer(options: ImageRenderer.IOptions) {
    if (!ImageRenderer) {
      return new TextRenderer({
        format: (config) => {
          return 'ImageRenderer not available. Check that you are using JupyterLab>=4.1.';
        },
        wrapText: true,
      });
    }
    return new ImageRenderer({
      ...options,
    });
  }

  renderer: ImageRenderer;

  model: ImageRendererModel;
}

export class HtmlRendererModel extends CellRendererModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: HtmlRendererModel.model_name,
      _view_name: HtmlRendererModel.view_name,
      font: '12px sans-serif',
      placeholder: '...',
      text_color: null,
      background_color: null,
      vertical_alignment: 'center',
      horizontal_alignment: 'left',
    };
  }

  get_attrs(): ICellRendererAttribute[] {
    return [
      { name: 'font', phosphorName: 'font', defaultValue: '12px sans-serif' },
      { name: 'placeholder', phosphorName: 'placeholder', defaultValue: '...' },
      {
        name: 'text_color',
        phosphorName: 'textColor',
        defaultValue: Theme.getFontColor(),
      },
      {
        name: 'background_color',
        phosphorName: 'backgroundColor',
        defaultValue: Theme.getBackgroundColor(),
      },
      {
        name: 'vertical_alignment',
        phosphorName: 'verticalAlignment',
        defaultValue: 'center',
      },
      {
        name: 'horizontal_alignment',
        phosphorName: 'horizontalAlignment',
        defaultValue: 'left',
      },
    ];
  }

  static serializers: ISerializers = {
    ...CellRendererModel.serializers,
    font: { deserialize: unpack_models as any },
    placeholder: { deserialize: unpack_models as any },
    text_color: { deserialize: unpack_models as any },
    background_color: { deserialize: unpack_models as any },
    vertical_alignment: { deserialize: unpack_models as any },
    horizontal_alignment: { deserialize: unpack_models as any },
  };

  static model_name = 'HtmlRendererModel';
  static view_name = 'HtmlRendererView';
}

export class HtmlRendererView extends CellRendererView {
  createRenderer(options: HtmlRenderer.IOptions) {
    // Workaround for Jupyter Lab 3 / ipywidget 7 compatibility
    let htmRenderer: any;

    if (!AsyncCellRenderer) {
      htmRenderer = new TextRenderer({
        format: (config) => {
          return 'AsyncCellRenderer not available. Check that you are using JupyterLab>=4.1.';
        },
        wrapText: true,
      });
    } else {
      htmRenderer = new exportedClass({
        ...options,
      });
      htmRenderer.imageLoaded.connect(() => {
        setTimeout(() => {
          this.trigger('renderer-needs-update');
        }, 0);
      });
    }

    return htmRenderer;
  }

  // Workaround for Jupyter Lab 3 / ipywidget 7 compatibility
  renderer: any;

  model: HtmlRendererModel;
}
