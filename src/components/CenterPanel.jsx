function CenterPanel() {
  return (
    <section className="panel" id="center">
      <div className="hero">
        <h2>Velkommen til Hogsite 👋</h2>
        <p>
          Hurtige flaksespill med skarpt grensesnitt og tydelig økonomi. Lås opp troféer, kjemp på leaderboard og sett ditt eget
          preg.
        </p>
        <div className="sub">
          Tusks: 4×4 – GRATIS – 10 klikk – 9 TUSK (+1), 1 GULL (+5), 1 DÅRLIG (−3), 5 TOM (0). På Halloween: 🎃 GRESSKAR-rute!
        </div>
      </div>

      <div className="games" id="spill">
        <div className="games-header">
          <h3>Alle spill</h3>
          <div className="arrow-buttons">
            <button className="btn" id="leftBtn">◀</button>
            <button className="btn" id="rightBtn">▶</button>
          </div>
        </div>

        <div className="games-row" id="gamesRow">
          <article className="card" id="tusksCard">
            <div className="thumb">TUSKS</div>
            <div className="body">
              <strong>Tusks</strong>
              <div className="tagline">
                Gratis! Finn gullloddet – og se opp for det dårlige. Halloween byr på gresskar-bonanza 🎃
              </div>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <button className="btn primary" id="playNowBtn" disabled>
                  Spill nå
                </button>
                <button className="btn" id="playAutoBtn" disabled>
                  🤖 Autospill nå
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export default CenterPanel;
