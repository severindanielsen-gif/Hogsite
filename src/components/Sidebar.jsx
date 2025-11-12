function Sidebar() {
  return (
    <aside className="panel side">
      <button className="btn" id="openInventory">
        🎒 Inventory <span className="tag" id="invCount">0</span>
      </button>
      <button className="btn" id="openAchievements">
        🏆 Achievements <span className="tag" id="achCount">0/8</span>
      </button>
      <button className="btn" id="openProfile">👤 Profil</button>
      <button className="btn">❓ Support</button>
      <button className="btn ghost" id="openHQuests" style={{ display: 'none' }}>
        🎃 Halloween Quests
      </button>
    </aside>
  );
}

export default Sidebar;
