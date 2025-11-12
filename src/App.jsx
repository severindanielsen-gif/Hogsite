import Banner from './components/Banner.jsx';
import Header from './components/Header.jsx';
import Layout from './components/Layout.jsx';
import Footer from './components/Footer.jsx';
import Overlay from './components/Overlay.jsx';
import UidBadge from './components/UidBadge.jsx';
import { useHogsiteApp } from './hooks/useHogsiteApp.js';

function App() {
  useHogsiteApp();

  return (
    <>
      <Banner />
      <Header />
      <Layout />
      <UidBadge />
      <Overlay />
      <Footer />
    </>
  );
}

export default App;
