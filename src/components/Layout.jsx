import Sidebar from './Sidebar.jsx';
import CenterPanel from './CenterPanel.jsx';
import RightPanel from './RightPanel.jsx';

function Layout() {
  return (
    <div className="layout">
      <Sidebar />
      <CenterPanel />
      <RightPanel />
    </div>
  );
}

export default Layout;
