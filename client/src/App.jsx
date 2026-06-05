import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Register from './pages/Register'
import Admin from './pages/Admin'
import './index.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Register />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
