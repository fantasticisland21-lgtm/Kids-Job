// 5分ごとに動いて、子どもの新しいお願い（おてつだい・こうかん）を、おとなの端末に知らせる
// GitHub Actions から実行される（画面からは使わない）v11
const admin = require("firebase-admin");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log("FIREBASE_SERVICE_ACCOUNT がまだ設定されていません");
  process.exit(0);
}
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const messaging = admin.messaging();

const APP_URL = "https://fantasticisland21-lgtm.github.io/Kids-Job/kids-job.html";
const PUSH_DOC = db.doc("settings/push");

// 通知に出す、お願いの中身
function what(r) {
  if (r.kind === "exchange") return `おこづかいにこうかん（${Number(r.yen) || 0}円）`;
  return r.label || "おてつだい";
}

async function main() {
  const [reqSnap, kidSnap, pushSnap] = await Promise.all([
    db.collection("requests").get(),
    db.collection("kids").get(),
    PUSH_DOC.get()
  ]);

  // まだ知らせていないお願い（古い順）
  const fresh = reqSnap.docs
    .filter(d => !d.data().notified)
    .sort((a, b) => (a.data().ts || 0) - (b.data().ts || 0));
  if (!fresh.length) { console.log("新しいお願いはありません"); return; }

  const devices = (pushSnap.exists && pushSnap.data().devices) || {};
  const entries = Object.entries(devices).filter(([, v]) => v && v.token);
  if (!entries.length) { console.log("通知を登録した端末がありません"); return; }
  const tokens = entries.map(([, v]) => v.token);

  const names = {};
  kidSnap.docs.forEach(d => { names[d.id] = d.data().name || "?"; });

  const lines = fresh.map(d => {
    const r = d.data();
    return { name: names[r.kid] || "?", text: what(r) };
  });
  let title, body;
  if (lines.length === 1) {
    title = `かくにん待ち：${lines[0].name}`;
    body = lines[0].text;
  } else {
    title = `かくにん待ち ${lines.length}件`;
    body = lines.map(l => `${l.name}：${l.text}`).join("\n");
  }
  if (body.length > 150) body = body.slice(0, 149) + "…";

  const res = await messaging.sendEachForMulticast({
    tokens,
    data: { title, body, url: APP_URL, badge: String(reqSnap.size) },
    webpush: { headers: { Urgency: "high" } }
  });
  console.log(`送った通知: ${res.successCount}/${tokens.length}`);

  // 無効になった端末の登録を消す
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (!r.success && (code === "messaging/registration-token-not-registered" ||
                       code === "messaging/invalid-registration-token")) {
      dead.push(entries[i][0]);
    }
  });
  if (dead.length) {
    const patch = {};
    dead.forEach(k => { patch[`devices.${k}`] = admin.firestore.FieldValue.delete(); });
    await PUSH_DOC.update(patch).catch(err => console.error(err));
  }

  // 1台でも届いたら「知らせ済み」にする（そのあいだにOK・とりけしで消えたものは飛ばす）
  if (res.successCount > 0) {
    await Promise.all(fresh.map(d =>
      d.ref.update({ notified: true }).catch(() => {})
    ));
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
