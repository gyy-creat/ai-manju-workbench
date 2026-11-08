import React from 'react'
import ReactDOM from 'react-dom/client'
import { ProjectProvider } from './lib/store.jsx'
import App from './App.jsx'
import { loadPrefs, applyPrefs } from './lib/uiPrefs.js'
import './styles.css'

// 进页面先把主题 / 字体 / 密度贴到 <html>，避免首帧闪一下默认皮肤
applyPrefs(loadPrefs())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </React.StrictMode>,
)
