function Header() {
  return (
    <header>
      <div className="logo">Hog<span>site</span></div>
      <nav className="topnav">
        <a href="#">Hjem</a>
        <a href="#spill">Spill</a>
        <a href="#" id="openBoard">Leaderboard</a>
      </nav>
      <div className="actions">
        <div className="coins">
          <span role="img" aria-label="Coins">💰</span>
          <span className="val" id="coinsVal">0</span>
        </div>
        <button className="btn" id="dailyBtn">🎁 Daily Bonus</button>
        <button className="btn ghost" id="autoToggleBtn">🤖 Auto-spill</button>
        <div className="avatar" id="editName">HS</div>
      </div>
    </header>
  );
}

export default Header;
