import { PromiseDelegate } from '@lumino/coreutils';
import {
  AsyncCellRenderer,
  CellRenderer,
  GraphicsContext,
  TextRenderer,
} from '@lumino/datagrid';
import { ISignal, Signal } from '@lumino/signaling';
import { Theme } from '../utils';

// Workaround for Jupyter Lab 3 / ipywidget 7 compatibility
let exportedClass: any;

/**
 * A cell renderer which renders data values as htmls.
 */
if (AsyncCellRenderer) {
  exportedClass = class HtmlRenderer extends AsyncCellRenderer {
    static dataCache = new Map<string, HTMLImageElement | undefined>();
    private _imgLoaded = new Signal<this, void>(this);

    /**
     * Construct a new html renderer.
     *
     * @param options - The options for initializing the renderer.
     */
    constructor(options: HtmlRenderer.IOptions = {}) {
      super();
      this.font = options.font || '12px';
      this.placeholder = options.placeholder || '...';
      this.textColor = options.textColor || Theme.getFontColor();
      this.backgroundColor =
        options.backgroundColor || Theme.getBackgroundColor();
      this.verticalAlignment = options.verticalAlignment || 'bottom';
      this.horizontalAlignment = options.horizontalAlignment || 'left';
    }

    /**
     * The size of the font in px.
     */
    readonly font: CellRenderer.ConfigOption<string>;

    /**
     * The placeholder text.
     */
    readonly placeholder: CellRenderer.ConfigOption<string>;

    /**
     * The color of the text.
     */
    readonly textColor: CellRenderer.ConfigOption<string>;

    /**
     * The color of the background.
     */
    readonly backgroundColor: CellRenderer.ConfigOption<string>;

    /**
     * The vertical alignment, default is 'bottom'.
     */
    readonly verticalAlignment: CellRenderer.ConfigOption<TextRenderer.VerticalAlignment>;

    /**
     * The horizontal alignment, default is 'left'.
     */
    readonly horizontalAlignment: CellRenderer.ConfigOption<TextRenderer.HorizontalAlignment>;

    isReady(config: CellRenderer.CellConfig): boolean {
      return (
        !config.value || HtmlRenderer.dataCache.get(config.value) !== undefined
      );
    }

    get imageLoaded(): ISignal<this, void> {
      return this._imgLoaded;
    }

    async load(config: CellRenderer.CellConfig): Promise<void> {
      if (!config.value) {
        return;
      }
      const value = config.value;
      const loadedPromise = new PromiseDelegate<void>();

      HtmlRenderer.dataCache.set(value, undefined);

      const img = new Image();

      img.src = this.htmlToSvg(config);
      img.width = config.width;
      img.height = config.height;

      img.onload = () => {
        HtmlRenderer.dataCache.set(value, img);
        loadedPromise.resolve();
        this._imgLoaded.emit();
      };

      return loadedPromise.promise;
    }

    paintPlaceholder(
      gc: GraphicsContext,
      config: CellRenderer.CellConfig,
    ): void {
      this.drawBackground(gc, config);
      this.drawPlaceholder(gc, config);
    }

    /**
     * Paint the content for a cell.
     *
     * @param gc - The graphics context to use for drawing.
     *
     * @param config - The configuration data for the cell.
     */
    paint(gc: GraphicsContext, config: CellRenderer.CellConfig): void {
      this.drawBackground(gc, config);
      this.drawImage(gc, config);
    }

    /**
     * Draw the background for the cell.
     *
     * @param gc - The graphics context to use for drawing.
     *
     * @param config - The configuration data for the cell.
     */
    drawBackground(gc: GraphicsContext, config: CellRenderer.CellConfig): void {
      // Resolve the background color for the cell.
      const color = CellRenderer.resolveOption(this.backgroundColor, config);

      // Bail if there is no background color to draw.
      if (!color) {
        return;
      }

      // Fill the cell with the background color.
      gc.fillStyle = color;
      gc.fillRect(config.x, config.y, config.width, config.height);
    }

    /**
     * Draw the placeholder for the cell.
     *
     * @param gc - The graphics context to use for drawing.
     *
     * @param config - The configuration data for the cell.
     */
    drawPlaceholder(
      gc: GraphicsContext,
      config: CellRenderer.CellConfig,
    ): void {
      const placeholder = CellRenderer.resolveOption(this.placeholder, config);
      const color = CellRenderer.resolveOption(this.textColor, config);

      const textX = config.x + config.width / 2;
      const textY = config.y + config.height / 2;

      // Draw the placeholder.
      gc.fillStyle = color;
      gc.fillText(placeholder, textX, textY);
    }

    /**
     * Draw the html.
     *
     * @param gc - The graphics context to use for drawing.
     *
     * @param config - The configuration data for the cell.
     */
    drawImage(gc: GraphicsContext, config: CellRenderer.CellConfig): void {
      // Bail early if there is nothing to draw
      if (!config.value) {
        return;
      }
      const img = HtmlRenderer.dataCache.get(config.value);

      // If it's not loaded yet, show the placeholder
      if (!img) {
        return this.drawPlaceholder(gc, config);
      }

      const font = CellRenderer.resolveOption(this.font, config);
      const textColor = CellRenderer.resolveOption(this.textColor, config);
      const textHeight = TextRenderer.measureFontHeight(font);
      const vAlign = CellRenderer.resolveOption(this.verticalAlignment, config);
      const hAlign = CellRenderer.resolveOption(
        this.horizontalAlignment,
        config,
      );
      const boxHeight = config.height - (vAlign === 'center' ? 1 : 2);

      if (boxHeight <= 0) {
        return;
      }

      gc.textBaseline = 'bottom';
      gc.textAlign = hAlign;
      gc.font = font;
      gc.fillStyle = textColor;

      if (textHeight > boxHeight) {
        gc.beginPath();
        gc.rect(config.x, config.y, config.width, config.height - 1);
        gc.clip();
      }

      gc.drawImage(img, config.x, config.y);
    }

    htmlToSvg(config: CellRenderer.CellConfig): string {
      const font = CellRenderer.resolveOption(this.font, config);
      const textColor = CellRenderer.resolveOption(this.textColor, config);
      const vAlign = CellRenderer.resolveOption(this.verticalAlignment, config);
      const hAlign = CellRenderer.resolveOption(
        this.horizontalAlignment,
        config,
      );
      const width = CellRenderer.resolveOption(config.width, config);
      const height = CellRenderer.resolveOption(config.height, config);
      const text = CellRenderer.resolveOption(config.value, config);

      const html = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px">
      <foreignObject width="${width}px" height="${height}px">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style="display: table-cell; font: ${font}; width: ${width}px; height: ${height}px; color: ${textColor}; vertical-align: ${
        vAlign === 'center' ? 'middle' : vAlign
      }; text-align: ${hAlign}"
        >
          <div style="display: inline-block; padding: 0 2px">${text}</div>
        </div>
      </foreignObject>
    </svg>`;

      return 'data:image/svg+xml,' + encodeURIComponent(html);
    }
  };
}

/**
 * The namespace for the `HtmlRenderer` class statics.
 */
export namespace HtmlRenderer {
  /**
   * An options object for initializing a html renderer.
   */
  export interface IOptions extends TextRenderer.IOptions {
    /**

     * The font for drawing the cell text.
     *
     * The default is `'12px sans-serif'`.
     */
    font?: CellRenderer.ConfigOption<string>;

    /**
     * The string to be displayed when placeholder is painted
     *
     * The default is `'...'`.
     */
    placeholder?: CellRenderer.ConfigOption<string>;

    /**
     * The color for the drawing the cell text.
     *
     * The default `'#000000'`.
     */
    textColor?: CellRenderer.ConfigOption<string>;

    /**
     * The vertical alignment for the cell text.
     *
     * The default is `'center'`.
     */
    verticalAlignment?: CellRenderer.ConfigOption<TextRenderer.VerticalAlignment>;
    /**
     * The horizontal alignment for the cell text.
     *
     * The default is `'left'`.
     */
    horizontalAlignment?: CellRenderer.ConfigOption<TextRenderer.HorizontalAlignment>;
    /**
     * The format function for the renderer.
     *
     * The default is `TextRenderer.formatGeneric()`.
     */
    // format?: FormatFunc;
  }
}

export { exportedClass };
