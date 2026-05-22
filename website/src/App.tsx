import { useState } from 'react'
import './App.css'
import logo from './assets/logo.png'

const STORE_URL = "https://chromewebstore.google.com/detail/workbar/ehakbbljejpjiibnlkkedlicpkmjjgah";

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const toggleModal = () => setIsModalOpen(!isModalOpen);

  return (
    <>
      <header>
        <div className="container nav-content">
          <a href="/" className="logo">
            <img src={logo} alt="Workbar Logo" />
            <span>Workbar</span>
          </a>
          <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="cta-button">Add to Chrome</a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container">
            <h1>Your Image Staging Area,<br />Right in Your Browser</h1>
            <p>
              Workbar simplifies your creative workflow by providing a dedicated space to stage, 
              organize, and manage images as you move between tools online.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
              <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="cta-button" style={{ padding: '1rem 2rem', fontSize: '1.25rem' }}>
                Add to Chrome
              </a>
              <button onClick={toggleModal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'underline' }}>
                Manual Installation
              </button>
            </div>
            
            <div className="hero-media">
              <video 
                src={`${import.meta.env.BASE_URL}demo-video.mov`} 
                controls 
                autoPlay 
                muted 
                loop 
                playsInline
                style={{ width: '100%', borderRadius: '1rem', display: 'block' }}
              />
            </div>
          </div>
        </section>

        {isModalOpen && (
          <div className="modal-overlay" onClick={toggleModal}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2>Manual Installation</h2>
              <p>
                If you prefer to run the latest development version or install it manually:
              </p>
              <ol className="install-steps">
                <li>
                  <strong>Clone the repository:</strong>
                  <div className="code-block">git clone https://github.com/your-username/workbar.git</div>
                </li>
                <li>
                  <strong>Install & Build:</strong>
                  <div className="code-block">npm install && npm run build</div>
                </li>
                <li>
                  <strong>Load Unpacked:</strong>
                  <p>Open <code>chrome://extensions</code>, enable "Developer mode", click "Load unpacked", and select the <code>workbar/dist</code> folder.</p>
                </li>
              </ol>
              <button onClick={toggleModal} className="close-modal">Got it!</button>
            </div>
          </div>
        )}


        <section className="problem-section">
          <div className="container problem-content">
            <h2>The Download/Upload Loop is Broken</h2>
            <p>
              Working with images online often involves downloading and uploading images many times, 
              which is incredibly slow and clutters your computer. Workbar replaces this flow 
              with a simple sidebar workspace that holds images as you use different tools online.
            </p>
          </div>
        </section>

        <section className="features">
          <div className="container">
            <h2>Everything you need for a faster workflow</h2>
            <div className="features-grid">
              <div className="feature-card">
                <span className="feature-icon">📥</span>
                <h3>Drag & Paste Anywhere</h3>
                <p>Quickly grab images from across the web or your desktop and drop them straight into your Workbar staging area.</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">📤</span>
                <h3>Direct Web Injection</h3>
                <p>Ready to use an image? Simply drag it from your Workbar directly onto any website or design tool.</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">✨</span>
                <h3>Download Sync</h3>
                <p>Your recent image downloads are automatically available in the Workbar, so you never have to hunt through your downloads folder.</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">📁</span>
                <h3>Project Organization</h3>
                <p>Keep your assets structured by organizing images into projects tailored to your specific tasks.</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">📂</span>
                <h3>Virtual Folders</h3>
                <p>Map virtual folders to your local desktop. Dragging images to these folders saves them directly to that path on your machine.</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">🚀</span>
                <h3>App Integration</h3>
                <p>Add quick links to the tools you use most, like Adobe Express or AI generators, for a seamless creation loop.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="gallery">
          <div className="container">
            <h2>See Workbar in Action</h2>
            <div className="gallery-grid">
              <div className="gallery-item">
                <img src={`${import.meta.env.BASE_URL}screenshot-1.png`} alt="Workbar Sidebar View" />
                <div className="gallery-caption">Intuitive Sidebar Workspace</div>
              </div>
              <div className="gallery-item">
                <img src={`${import.meta.env.BASE_URL}screenshot-2.png`} alt="Workbar Project Management" />
                <div className="gallery-caption">Organize by Project</div>
              </div>
              <div className="gallery-item">
                <img src={`${import.meta.env.BASE_URL}screenshot-3.png`} alt="Workbar Virtual Folders" />
                <div className="gallery-caption">Local File System Sync</div>
              </div>
              <div className="gallery-item">
                <img src={`${import.meta.env.BASE_URL}screenshot-4.png`} alt="Workbar App Links" />
                <div className="gallery-caption">One-Click Tool Access</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="container">
          <div className="footer-logo">Workbar</div>
          <p className="footer-text">
            © 2024 Workbar. Built to make the web a more creative place.<br />
            Made with ❤️ for designers, creators, and curators.
          </p>
        </div>
      </footer>
    </>
  )
}

export default App
