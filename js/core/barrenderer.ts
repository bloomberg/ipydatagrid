import { CellRenderer, TextRenderer, GraphicsContext } from '@lumino/datagrid';

/**
 * A cell renderer which renders data values as bars.
 */
export class BarRenderer extends TextRenderer {
  /**
   * Construct a new bar renderer.
   *
   * @param options - The options for initializing the renderer.
   */
  constructor(options: BarRenderer.IOptions = {}) {
    super(options);
    this.barColor = options.barColor || '#4682b4';
    this.barValue = options.barValue || 0;
    this.orientation = options.orientation || 'horizontal';
    this.barVerticalAlignment = options.barVerticalAlignment || 'bottom';
    this.barHorizontalAlignment = options.barHorizontalAlignment || 'left';
    this.showText = options.showText || true;
  }

  /**
   * The CSS color for drawing the bar.
   */
  readonly barColor: CellRenderer.ConfigOption<string>;

  /**
   * The value of the bar, between 0. and 1.
   */
  readonly barValue: CellRenderer.ConfigOption<number>;

  /**
   * The orientation of the bar, can be horizontal or vertical.
   */
  readonly orientation: CellRenderer.ConfigOption<BarRenderer.Orientation>;

  /**
   * The horizontal alignment of the bar, default is 'bottom'.
   */
  readonly barVerticalAlignment: CellRenderer.ConfigOption<TextRenderer.VerticalAlignment>;

  /**
   * The vertical alignment of the bar, default is 'left'.
   */
  readonly barHorizontalAlignment: CellRenderer.ConfigOption<TextRenderer.HorizontalAlignment>;

  /**
   * Whether to draw the text on the bar or not, default is true.
   */
  readonly showText: CellRenderer.ConfigOption<boolean>;

  /**
   * Paint the content for a cell.
   *
   * @param gc - The graphics context to use for drawing.
   *
   * @param config - The configuration data for the cell.
   */
  paint(gc: GraphicsContext, config: CellRenderer.CellConfig): void {
    const showText = CellRenderer.resolveOption(this.showText, config);

    this.drawBackground(gc, config);
    this.drawBar(gc, config);
    if (showText) this.drawText(gc, config);
  }

  /**
   * Prepare the graphics context for drawing a column of cells.
   *
   * @param gc - The graphics context to prepare.
   *
   * @param row - The index of the first row to be rendered.
   *
   * @param col - The index of the column to be rendered.
   *
   * @param field - The field descriptor for the column, or `null`.
   */
  prepare(gc: GraphicsContext, config: CellRenderer.CellConfig): void {
    // Look up the default state from the renderer.
    const { font, textColor, barColor, backgroundColor, horizontalAlignment } =
      this;

    // Set up the default font.
    if (font && typeof font === 'string') {
      gc.font = font;
    }

    // Set up the default fill style.
    if (backgroundColor && typeof backgroundColor === 'string') {
      gc.fillStyle = backgroundColor;
    } else if (barColor && typeof barColor === 'string') {
      gc.fillStyle = barColor;
    } else if (textColor && typeof textColor === 'string') {
      gc.fillStyle = textColor;
    }

    // Set up the default text alignment.
    if (typeof horizontalAlignment === 'string') {
      gc.textAlign = horizontalAlignment;
    } else {
      gc.textAlign = 'left';
    }

    // Set up the default text baseline.
    gc.textBaseline = 'bottom';
  }

  /**
   * Draw the bar.
   *
   * @param gc - The graphics context to use for drawing.
   *
   * @param config - The configuration data for the cell.
   */
  drawBar(gc: GraphicsContext, config: CellRenderer.CellConfig): void {
    const barColor = CellRenderer.resolveOption(this.barColor, config);
    let barValue = CellRenderer.resolveOption(this.barValue, config);
    const vAlign = CellRenderer.resolveOption(
      this.barVerticalAlignment,
      config,
    );
    const hAlign = CellRenderer.resolveOption(
      this.barHorizontalAlignment,
      config,
    );
    const orientation = CellRenderer.resolveOption(this.orientation, config);

    // Bail if there is no color to draw.
    if (!barColor) {
      return;
    }

    // Be careful not to draw outside of the cell
    if (barValue > 1) {
      barValue = 1;
    }
    if (barValue < 0) {
      barValue = 0;
    }

    let x: number = config.x;
    let y: number = config.y;

    // Draw the bar in the cell.
    gc.fillStyle = barColor;
    if (orientation === 'horizontal') {
      const rect_width = barValue * config.width;

      if (hAlign === 'center') x += (config.width - rect_width) / 2;
      if (hAlign === 'right') x += config.width - rect_width;

      gc.fillRect(x, y, rect_width, config.height);
    } else {
      const rect_height = barValue * config.height;

      if (vAlign === 'center') {
        y += (config.height - rect_height) / 2;
      } else if (vAlign === 'bottom') {
        y += config.height - rect_height;
      }

      gc.fillRect(x, y, config.width, rect_height);
    }
  }
}

/**
 * The namespace for the `BarRenderer` class statics.
 */
export namespace BarRenderer {
  /**
   * A type alias for the supported orientation modes.
   */
  export type Orientation = 'horizontal' | 'vertical';

  /**
   * An options object for initializing a bar renderer.
   */
  export interface IOptions extends TextRenderer.IOptions {
    /**
     * The background color for the cells.
     *
     * The default is `''`.
     */
    barColor?: CellRenderer.ConfigOption<string>;

    /**
     * The value of the bar, between 0. and 1..
     *
     * The default is `0.`.
     */
    barValue?: CellRenderer.ConfigOption<number>;

    /**
     * The orientation of the bar, can be horizontal or vertical.
     *
     * The default is `horizontal`.
     */
    orientation?: CellRenderer.ConfigOption<BarRenderer.Orientation>;

    /**
     * The horizontal alignment of the bar, can be bottom, center or top.
     *
     * The default is `bottom`.
     */
    barVerticalAlignment?: CellRenderer.ConfigOption<TextRenderer.VerticalAlignment>;

    /**
     * The vertical alignment of the bar, can be left, center or right.
     *
     * The default is `left`.
     */
    barHorizontalAlignment?: CellRenderer.ConfigOption<TextRenderer.HorizontalAlignment>;

    /**
     * Whether to draw the text on the bar or not.
     *
     * The default is true.
     */
    showText?: CellRenderer.ConfigOption<boolean>;
  }
}
