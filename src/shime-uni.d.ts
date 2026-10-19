export {}

declare module "vue" {
  type Hooks = App.AppInstance & Page.PageInstance;
  interface ComponentCustomOptions extends Hooks {}
  interface ComponentCustomProperties {
    $formatTime: (ts: number) => string
  }
}