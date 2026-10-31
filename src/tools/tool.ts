export interface Tool {
  /** Used in the address, e.g. #create. */
  id: string;
  /** Short name for the tab. */
  title: string;
  heading: string;
  description: string;
  mount(container: HTMLElement): void;
  /** Called when the user switches to another tool. */
  hide?(): void;
}
