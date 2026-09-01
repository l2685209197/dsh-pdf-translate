// vitest 全局 setup：声明 React act 环境，消除
// "The current testing environment is not configured to support act(...)" 警告。
// React 18 的 act() 需要该标志；生产运行时由宿主提供，此处仅测试需要。
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

export {}
