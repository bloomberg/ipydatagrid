import { DataGrid } from '@lumino/datagrid';
import { Debouncer } from '@lumino/polling';
import { IMessageHandler, Message } from '@lumino/messaging';
import { FeatherGrid } from './feathergrid';

export class StreamingFeatherGrid extends FeatherGrid {
  constructor(options: StreamingFeatherGrid.IOptions) {
    super(options);

    this._requestData = options.requestData;

    this._pullData = new Debouncer(
      this.pullDataImpl.bind(this),
      options.debounceDelay,
    );
  }

  messageHook(handler: IMessageHandler, msg: Message): boolean {
    if (handler === this.grid.viewport) {
      if (
        msg.type === 'scroll-request' ||
        msg.type === 'resize' ||
        msg.type === 'row-resize-request' ||
        msg.type === 'column-resize-request'
      ) {
        this._pullData.invoke();
      }
    }

    return true;
  }

  private pullDataImpl() {
    let width = this.grid.viewport.node.offsetWidth;
    let height = this.grid.viewport.node.offsetHeight;

    width = Math.round(width);
    height = Math.round(height);

    if (width <= 0 || height <= 0) {
      return;
    }

    // TODO Contribute upstream to provide public APIs to get the current viewport
    // This will help us remove those ts-ignores and get rid of low-level code
    // @ts-ignore
    const contentW = this.grid._columnSections.length - this.grid.scrollX;
    // @ts-ignore
    const contentH = this.grid._rowSections.length - this.grid.scrollY;

    const contentX = this.grid.headerWidth;
    const contentY = this.grid.headerHeight;

    const x1 = contentX;
    const y1 = contentY;
    const x2 = Math.min(width - 1, contentX + contentW - 1);
    const y2 = Math.min(height - 1, contentY + contentH - 1);

    // @ts-ignore
    const r1 = this.grid._rowSections.indexOf(
      y1 - contentY + this.grid.scrollY,
    );
    // @ts-ignore
    const c1 = this.grid._columnSections.indexOf(
      x1 - contentX + this.grid.scrollX,
    );
    // @ts-ignore
    const r2 = this.grid._rowSections.indexOf(
      y2 - contentY + this.grid.scrollY,
    );
    // @ts-ignore
    const c2 = this.grid._columnSections.indexOf(
      x2 - contentX + this.grid.scrollX,
    );

    this._requestData(r1, r2, c1, c2);
  }

  private _requestData: (
    r1: number,
    r2: number,
    c1: number,
    c2: number,
  ) => void;
  private _pullData: Debouncer;
}

export namespace StreamingFeatherGrid {
  export interface IOptions extends DataGrid.IOptions {
    /**
     * The function for requesting data to the back-end.
     */
    requestData: (r1: number, r2: number, c1: number, c2: number) => void;

    /**
     * Delay for debouncing data requests.
     */
    debounceDelay: number;
  }
}
