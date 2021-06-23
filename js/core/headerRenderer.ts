import { TextRenderer, CellRenderer, GraphicsContext } from '@lumino/datagrid';

import { ViewBasedJSONModel } from './viewbasedjsonmodel';

import { Theme } from '../utils';

import { TransformStateManager } from './transformStateManager';

import { DataGrid } from '@lumino/datagrid';

/**
 * A custom cell renderer for headers that provides a menu icon.
 */
export class HeaderRenderer extends TextRenderer {
  constructor(options: HeaderRenderer.IOptions) {
    super(options.textOptions);
    this._isLightTheme = options.isLightTheme;
    this._grid = options.grid;
  }

  /**
   * Model getter.
   */
  get model(): ViewBasedJSONModel {
    return this._grid.dataModel as ViewBasedJSONModel;
  }

  /**
   * Draw the text for the cell.
   *
   * @param gc - The graphics context to use for drawing.
   *
   * @param config - The configuration data for the cell.
   */
  drawText(gc: GraphicsContext, config: CellRenderer.CellConfig): void {
    // Resolve the font for the cell.
    const font = CellRenderer.resolveOption(this.font, config);

    // Bail if there is no font to draw.
    if (!font) {
      return;
    }

    // Resolve the text color for the cell.
    const color = CellRenderer.resolveOption(this.textColor, config);

    // Bail if there is no text color to draw.
    if (!color) {
      return;
    }

    // Format the cell value to text.
    const format = this.format;
    let text = format(config);

    // Bail if there is no text to draw.
    if (!text) {
      return;
    }

    // Resolve the vertical and horizontal alignment.
    const vAlign = CellRenderer.resolveOption(this.verticalAlignment, config);
    const hAlign = CellRenderer.resolveOption(this.horizontalAlignment, config);

    // Resolve the elision direction
    const elideDirection = CellRenderer.resolveOption(
      this.elideDirection,
      config,
    );

    // Resolve the text wrapping flag
    const wrapText = CellRenderer.resolveOption(this.wrapText, config);

    // Compute the padded text box height for the specified alignment.
    const boxHeight = config.height - (vAlign === 'center' ? 1 : 2);

    // Bail if the text box has no effective size.
    if (boxHeight <= 0) {
      return;
    }

    // Compute the text height for the gc font.
    const textHeight = TextRenderer.measureFontHeight(font);

    // Set up the text position variables.
    let textX: number;
    let textY: number;
    let boxWidth: number;

    // Compute the Y position for the text.
    switch (vAlign) {
      case 'top':
        textY = config.y + 2 + textHeight;
        break;
      case 'center':
        textY = config.y + config.height / 2 + textHeight / 2;
        break;
      case 'bottom':
        textY = config.y + config.height - 2;
        break;
      default:
        throw 'unreachable';
    }

    // Compute the X position for the text.
    switch (hAlign) {
      case 'left':
        textX = config.x + 8;
        boxWidth = config.width - 14;
        break;
      case 'center':
        textX = config.x + config.width / 2;
        boxWidth = config.width;
        break;
      case 'right':
        textX = config.x + config.width - 8;
        boxWidth = config.width - 14;
        break;
      default:
        throw 'unreachable';
    }

    // Clip the cell if the text is taller than the text box height.
    if (textHeight > boxHeight) {
      gc.beginPath();
      gc.rect(config.x, config.y, config.width, config.height - 1);
      gc.clip();
    }

    // Set the gc state.
    gc.font = font;
    gc.fillStyle = color;
    gc.textAlign = hAlign;
    gc.textBaseline = 'bottom';

    // The current text width in pixels.
    let textWidth = gc.measureText(text).width;

    // Apply text wrapping if enabled.
    if (wrapText && textWidth > boxWidth) {
      // Make sure box clipping happens.
      gc.beginPath();
      gc.rect(config.x, config.y, config.width, config.height - 1);
      gc.clip();

      // Split column name to words based on
      // whitespace preceding a word boundary.
      // "Hello  world" --> ["Hello  ", "world"]
      const wordsInColumn = text.split(/\s(?=\b)/);

      // Y-coordinate offset for any additional lines
      let curY = textY;
      let textInCurrentLine = wordsInColumn.shift()!;

      // Single word. Applying text wrap on word by splitting
      // it into characters and fitting the maximum number of
      // characters possible per line (box width).
      if (wordsInColumn.length === 0) {
        let curLineTextWidth = gc.measureText(textInCurrentLine).width;
        while (curLineTextWidth > boxWidth && textInCurrentLine !== '') {
          // Iterating from the end of the string until we find a
          // substring (0,i) which has a width less than the box width.
          for (let i = textInCurrentLine.length; i > 0; i--) {
            const curSubString = textInCurrentLine.substring(0, i);
            const curSubStringWidth = gc.measureText(curSubString).width;
            if (curSubStringWidth < boxWidth || curSubString.length === 1) {
              // Found a substring which has a width less than the current
              // box width. Rendering that substring on the current line
              // and setting the remainder of the parent string as the next
              // string to iterate on for the next line.
              const nextLineText = textInCurrentLine.substring(
                i,
                textInCurrentLine.length,
              );
              textInCurrentLine = nextLineText;
              curLineTextWidth = gc.measureText(textInCurrentLine).width;
              gc.fillText(curSubString, textX, curY);
              curY += textHeight;
              // No need to continue iterating after we identified
              // an index to break the string on.
              break;
            }
          }
        }
      }

      // Multiple words in column header. Fitting maximum
      // number of words possible per line (box width).
      else {
        while (wordsInColumn.length !== 0) {
          // Processing the next word in the queue.
          const curWord = wordsInColumn.shift();
          // Joining that word with the existing text for
          // the current line.
          const incrementedText = [textInCurrentLine, curWord].join(' ');
          const incrementedTextWidth = gc.measureText(incrementedText).width;
          if (incrementedTextWidth > boxWidth) {
            // If the newly combined text has a width larger than
            // the box width, we render the line before the current
            // word was added. We set the current word as the next
            // line.
            gc.fillText(textInCurrentLine, textX, curY);
            curY += textHeight;
            textInCurrentLine = curWord!;
          } else {
            // The combined text hasd a width less than the box width. We
            // set the the current line text to be the new combined text.
            textInCurrentLine = incrementedText;
          }
        }
      }
      gc.fillText(textInCurrentLine!, textX, curY);
      // Terminating the call here as we don't want
      // to apply text eliding when wrapping is active.
      return;
    }

    // Elide text that is too long
    const elide = '\u2026';

    // Compute elided text
    if (elideDirection === 'right') {
      while (textWidth > boxWidth && text.length > 1) {
        if (text.length > 4 && textWidth >= 2 * boxWidth) {
          // If text width is substantially bigger, take half the string
          text = text.substring(0, text.length / 2 + 1) + elide;
        } else {
          // Otherwise incrementally remove the last character
          text = text.substring(0, text.length - 2) + elide;
        }
        textWidth = gc.measureText(text).width;
      }
    } else {
      while (textWidth > boxWidth && text.length > 1) {
        if (text.length > 4 && textWidth >= 2 * boxWidth) {
          // If text width is substantially bigger, take half the string
          text = elide + text.substring(text.length / 2);
        } else {
          // Otherwise incrementally remove the last character
          text = elide + text.substring(2);
        }
        textWidth = gc.measureText(text).width;
      }
    }

    // Draw the text for the cell.
    gc.fillText(text, textX, textY);

    // Check if not bottom row of 'column-header' CellRegion
    if (
      config.region === 'column-header' &&
      config.row !== this._grid.dataModel!.rowCount('column-header') - 1
    ) {
      return;
    }

    // Fill the area behind the menu icon
    // Note: This seems to perform better than adding a clip path
    const backgroundSize =
      HeaderRenderer.iconWidth +
      HeaderRenderer.iconWidth +
      HeaderRenderer.iconSpacing +
      2 * HeaderRenderer.buttonPadding;

    gc.fillStyle = CellRenderer.resolveOption(this.backgroundColor, config);
    gc.fillRect(
      config.x + config.width - backgroundSize,
      config.y + config.height - backgroundSize,
      backgroundSize,
      backgroundSize,
    );

    const iconStart =
      config.x +
      config.width -
      HeaderRenderer.iconWidth -
      HeaderRenderer.buttonPadding;

    // Draw filter icon
    this.drawFilterIcon(gc, config);
    // Sets filter icon to gray fill
    gc.fillStyle = Theme.getBorderColor(1);
    gc.fill();

    // Check for transform metadata
    if (this.model) {
      // Get cell metadata
      const schemaIndex = this.model.getSchemaIndex(
        config.region,
        config.column,
      );

      const colMetaData: TransformStateManager.IColumn | undefined =
        this.model.transformMetadata(schemaIndex);

      // Fill filter icon if filter applied
      if (colMetaData && colMetaData['filter']) {
        gc.fillStyle = Theme.getBrandColor(this._isLightTheme ? 8 : 6);
        gc.fill();
      }

      // Fill sort icon if sort applied
      if (colMetaData && colMetaData['sort']) {
        // Display ascending or descending icon depending on order
        if (colMetaData['sort'].desc) {
          this.drawSortArrow(gc, config, iconStart, false);
        } else {
          this.drawSortArrow(gc, config, iconStart, true);
        }
        gc.fillStyle = Theme.getBrandColor(this._isLightTheme ? 7 : 5);
        gc.fill();
      }
    }
  }

  /**
   * Draw the filter icon for the cell
   *
   * @param gc - The graphics context to use for drawing.
   *
   * @param config - The configuration data for the cell.
   */
  drawFilterIcon(gc: GraphicsContext, config: CellRenderer.CellConfig): void {
    const filterIconStart =
      config.x +
      config.width -
      HeaderRenderer.iconWidth -
      HeaderRenderer.buttonPadding;

    const filterRightStemWidthX: number = HeaderRenderer.iconWidth / 2 + 1;
    const filterLeftStemWidthX: number = HeaderRenderer.iconWidth / 2 - 1;
    const filterTop: number =
      config.height - HeaderRenderer.iconHeight - 1 + config.y;

    gc.beginPath();
    // Start drawing in top left of filter icon
    gc.moveTo(filterIconStart, filterTop);

    gc.lineTo(filterIconStart + HeaderRenderer.iconWidth, filterTop);
    // Y is the y value of the top of the stem
    gc.lineTo(
      filterIconStart + filterRightStemWidthX,
      config.y + config.height - HeaderRenderer.iconHeight + 2,
    );
    // Y is the y value of the bottom of the stem
    gc.lineTo(
      filterIconStart + filterRightStemWidthX,
      config.y + config.height - 1.5 * HeaderRenderer.buttonPadding,
    );
    gc.lineTo(
      filterIconStart + filterLeftStemWidthX,
      config.y + config.height - 2 * HeaderRenderer.buttonPadding,
    );
    gc.lineTo(
      filterIconStart + filterLeftStemWidthX,
      config.y + config.height - HeaderRenderer.iconHeight + 2,
    );
    gc.closePath();
  }

  /**
   * Draw the ascending and descending sort icons for the cell
   *
   * @param gc - The graphics context to use for drawing.
   *
   * @param config - The configuration data for the cell.
   *
   * @param filterIconStart - The bottom right corner of drawing area.
   *
   * @param asc - Indicates whether to draw ascending or descending icon.
   */
  drawSortArrow(
    gc: GraphicsContext,
    config: CellRenderer.CellConfig,
    filterIconStart: number,
    asc: boolean,
  ): void {
    const arrowWidth = HeaderRenderer.iconWidth - 2;
    const sortIconStart = filterIconStart - HeaderRenderer.iconSpacing;
    const ascArrowRightStemWidth: number = sortIconStart - arrowWidth / 2 + 0.5;
    const descArrowRightStemWidth: number =
      sortIconStart - arrowWidth / 2 - 0.5;
    const arrowHeadSideY: number =
      config.height +
      config.y -
      HeaderRenderer.buttonPadding -
      HeaderRenderer.iconHeight +
      4;
    const arrowMiddle: number = sortIconStart - arrowWidth / 2;
    const ascArrowTipY: number =
      config.height + config.y - HeaderRenderer.iconHeight - 1;
    const ascArrowBottomY: number =
      config.height - 8 + config.y + HeaderRenderer.buttonPadding;

    gc.beginPath();

    if (asc) {
      // Draw starting in middle of arrow
      // Y is the tip of the ascending arrow
      gc.moveTo(arrowMiddle, ascArrowTipY);
      gc.lineTo(sortIconStart, arrowHeadSideY);
      gc.lineTo(sortIconStart, arrowHeadSideY + 1);

      // Draw to middle of arrow
      gc.lineTo(ascArrowRightStemWidth, arrowHeadSideY + 1);

      // Y is the bottom of the arrow stem
      gc.lineTo(arrowMiddle + 0.5, ascArrowBottomY);
      gc.lineTo(arrowMiddle - 0.5, ascArrowBottomY);
      gc.lineTo(arrowMiddle - 0.5, arrowHeadSideY + 1);
      gc.lineTo(sortIconStart - arrowWidth, arrowHeadSideY + 1);
      gc.lineTo(sortIconStart - arrowWidth, arrowHeadSideY);
    } else {
      // Draw starting in middle of arrow
      // Y is the tip of the descending arrow
      gc.moveTo(arrowMiddle, ascArrowBottomY);
      gc.lineTo(sortIconStart - arrowWidth, arrowHeadSideY + 4.5);
      gc.lineTo(sortIconStart - arrowWidth, arrowHeadSideY + 3.5);

      // Draw to middle of arrow
      gc.lineTo(descArrowRightStemWidth, arrowHeadSideY + 3.5);

      // Y is the bottom of the arrow stem
      gc.lineTo(descArrowRightStemWidth, ascArrowTipY);
      gc.lineTo(arrowMiddle + 0.5, ascArrowTipY);

      // Draw left side of descending arrow
      gc.lineTo(arrowMiddle + 0.5, arrowHeadSideY + 3.5);
      gc.lineTo(sortIconStart, arrowHeadSideY + 3.5);
      gc.lineTo(sortIconStart, arrowHeadSideY + 4.5);
    }
    gc.closePath();
  }

  /**
   * Indicates the size of the menu icon, to support the current implementation
   * of hit testing.
   */
  static buttonSize = 11;
  static iconHeight = 12;
  static iconWidth = 7;
  static buttonPadding = 3;
  static iconSpacing = 1.5;

  private _isLightTheme: boolean;
  private _grid: DataGrid;
}

/**
 * The namespace for the `HeaderRenderer` class statics.
 */
export namespace HeaderRenderer {
  /**
   * An options object for initializing a renderer.
   */
  export interface IOptions {
    /**
     * The data model this renderer should get metadata from.
     */
    textOptions: TextRenderer.IOptions;
    isLightTheme: boolean;
    grid: DataGrid;
  }
}
