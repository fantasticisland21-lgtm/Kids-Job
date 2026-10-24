// 通知を受け取るための裏方のファイル（リポジトリの一番上に置く）v11

// 届いた通知は、アプリを開いているときも閉じているときも、必ずここで1回だけ表示する
// （iPhoneは、表示しない通知が続くと通知を止めてしまうため）
self.addEventListener("push", event => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { p = {}; }
  const d = p.data || p.notification || {};
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "おてつだい", {
      body: d.body || "",
      tag: "kids-job-requests", // 新しい通知が来たら、前の通知と入れかえる
      renotify: true,
      data: { url: d.url || "kids-job.html" }
    }),
    setBadge(d.badge)
  ]));
});

// ホーム画面のアイコンのバッジ（かくにん待ちの件数）を、通知が届いたときに合わせる
async function setBadge(value) {
  try {
    if (value === undefined || value === null || value === "") return;
    if (!("setAppBadge" in self.navigator)) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    if (n > 0) await self.navigator.setAppBadge(n);
    else await self.navigator.clearAppBadge();
  } catch (e) {
    console.error(e);
  }
}

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCNJjf-TecemMF04jvuvXV3ZfeokluJMBs",
  authDomain: "kids-job.firebaseapp.com",
  projectId: "kids-job",
  storageBucket: "kids-job.firebasestorage.app",
  messagingSenderId: "341087334902",
  appId: "1:341087334902:web:a9ed53c6c70f571ea697d7"
});

// 通知の登録（トークン）のために読み込む。表示は上の push で行うので、ここでは表示しない
firebase.messaging();

// 通知をタップしたら、アプリを開く（開いていれば、その画面に切り替える）
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "kids-job.html";
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if ("focus" in c) return c.focus();
    }
    return clients.openWindow(url);
  })());
});
