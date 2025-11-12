function RightPanel() {
  return (
    <aside className="panel">
      <div className="widget">
        <h4>Daglig bonus</h4>
        <p className="tip" id="dailyTip">Hent bonusen din én gang per dag.</p>
        <div className="kpi" style={{ marginTop: '.6rem' }}>
          <div className="box">
            <div>Bonus i dag</div>
            <div className="val" id="bonusVal">
              +3
            </div>
          </div>
          <div className="box">
            <div>Streak</div>
            <div className="val" id="streakVal">
              …
            </div>
          </div>
        </div>
        <button className="btn" style={{ marginTop: '.6rem' }} id="dailyBtnSide">
          🎁 Hent bonus
        </button>
      </div>
      <div className="widget">
        <h4>Nyheter</h4>
        <ul className="news" id="newsList">
          <li>🤖 Autospill fortsetter selv om du lukker spillet.</li>
          <li>📊 Leaderboard med stabil scroll.</li>
        </ul>
      </div>
      <div className="widget">
        <h4>Tips</h4>
        <p className="tip">Spill smart: jag kombinasjoner for achievements – ikke bare gull!</p>
      </div>
    </aside>
  );
}

export default RightPanel;
