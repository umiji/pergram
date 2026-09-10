/**
 * 「正式版のリリースを応援する」の段階（T-050 / T-051、文言は T-061）。依存パッケージなし。
 *
 * **LP（/{locale}/）と製品一覧（/{locale}/{nutrient}/）の両方で動く。**
 * 段は 要望 → アンケート → メール → 支援 の順に開く。開くまでは HTML 側で
 * hidden が付いている（src/templates/request.js）。
 *
 * 🔒 押下数を画面に描画しない。ボタンの状態を「受け取りました」に変えるだけで、
 *    数も順位も出さない（景表法の「人気」表示・N-03）。
 * 🔒 GA4 に個人識別情報を送らない。**メールアドレスをイベントパラメータに含めない。**
 * 🔒 自由記述の**本文**を GA4 へ送らない。書かれたかどうか（0 / 1）だけを数える。
 * 🔒 待機リスト（/api/waitlist）へ送るのは既存の6列の範囲だけ。列を足さない。
 *    アンケートの回答は、メールアドレスの段を送ったときにもここへ相乗りする。
 *    ⚠️ **これに加えて、匿名の識別子（signal_id）だけを添えて送る**（T-072）。
 *    受け口が匿名のアンケートの行を引き取り、**その識別子を捨てて**1行にまとめるため。
 *    保存される列は増えていない（識別子は `id` 列へ書かれない）。
 * 🔒 **アンケートの回答は、送った時点で /api/request-survey へも匿名で送る**（T-070）。
 *    ⚠️ 以前は「メールアドレスが無ければ保存しない。保存の鍵がそれしかない」だった。
 *    `waitlist` は email が主キーで匿名の行が入らないためで、その結果
 *    **「押した → 成分を答えた → メールは入れない」人の回答を全部捨てていた。**
 *    匿名の受け口ができたので、その仕様は上書きされている。**戻さないこと。**
 * 🔒 **送りきれなかったアンケートの回答は localStorage へ控え、次の訪問で送り直す**
 *    （T-070 / R-1 の裁定）。アンケートの段は送信後に開き直せないので、
 *    撃ちっぱなしにすると失敗した回答がそのまま失われる。**受領できたら必ず消す。**
 * 🔒 送信後に別ページへ飛ばさない。同じ画面で完了状態に切り替える。
 * 🔒 匿名シグナル（/api/request-signal）が失敗しても**段は必ず開く**。
 *    保存は計測の都合であって、ユーザーの用ではない。
 */
(() => {
  'use strict';

  /** 送信中の状態を明示するための待ち時間の上限（ms）。src/assets/lp.js と同じ */
  const REQUEST_TIMEOUT_MS = 10000;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---- 匿名シグナル（T-051） ------------------------------------------ */

  /** 第1段階の押下を1行だけ残す受け口。持つのは UUID と日時だけ */
  const SIGNAL_ENDPOINT = '/api/request-signal';

  /**
   * 第2段階のアンケートの回答を**匿名のまま**残す受け口（T-070）。
   *
   * 🔒 **メールアドレスを入れなかった人の回答は、以前ここが無くて全部捨てられていた。**
   *    `waitlist` は `email` が主キーなので、匿名の行は物理的に入らない。
   *    「押した → 成分を答えた → メールは入れない」人の回答は、次に何を載せるかを
   *    決める情報そのものである。**この送信を消さないこと。**
   * 🔒 送る本文は `{ id, nutrients, channel, nutrients_other, requests }` **ちょうど。**
   *    メールアドレスを混ぜない（混ぜた瞬間に匿名でなくなる）。`page` も送らない
   *    （どのページかは同じ id の `request_signal` の行が持っている）。
   *    受け口はキー集合がちょうど一致しなければ 400 で捨てる。
   */
  const SURVEY_ENDPOINT = '/api/request-survey';

  /**
   * **まだ受け口に届いていないアンケートの回答**の置き場（T-070 / R-1 の裁定）。
   *
   * 🔒 **受領できたら必ず消す。** ここは送信の待ち行列（出荷箱）であって、
   *    回答の控えを手元に貯めておく場所ではない。消す条件は
   *    `postRequestSurvey` の1箇所だけに置いてある。
   * 🔒 入るのは**受け口へ送る本文そのもの**（`{ id, nutrients, channel,
   *    nutrients_other, requests }`）だけ。**メールアドレスを入れない**
   *    （この経路は匿名である）。年齢・性別・体調・服薬は元から扱わない。
   * ⚠️ 自由記述が入る。**サーバへ送る前提のものを、送るまで手元に置くだけ**である
   *    （`.claude/rules/pergram-compliance.md`「データ保護」は、これらを
   *    **サーバへ送らないこと**を守っており、localStorage はむしろ指定された置き場）。
   *    **中身をコードで解釈しない**（N-01 / N-05）。
   * ⚠️ 共用端末では次の利用者にも読める。だから受領できた時点で消す。
   */
  const SURVEY_OUTBOX_KEY = 'pergram.request_survey_outbox';

  /**
   * **このブラウザの匿名の行が、メールアドレスの行へ引き取られたことの目印**
   * （T-072 / D-1 の差し戻し、2026-09-09）。
   *
   * 🔒 **ここに印がある間、匿名の受け口（/api/request-survey）へは何も送らない。**
   *    送ると匿名の行が**作り直され**、同じ人が2行に戻る（二重計上が復活する）。
   *    これが起きるのは2つの経路である。
   *      1. 送りきれなかった回答の控えが、次の訪問で同じ識別子のまま送り直される
   *      2. まとめた後に、同じブラウザでもう一度アンケートに答える
   * 🔒 **この判定はブラウザ側にしか置けない。** 受け口の側は、まとめた時点で
   *    識別子を捨てている（それが T-072 の目的そのもの）ので、
   *    「この識別子はもう引き取り済みだ」と知る手段を**設計上持っていない。**
   *    サーバに持たせるには引き取り済みの識別子を保存することになり、
   *    匿名の押下とメールアドレスの紐づけが復活する。**サーバ側へ移さないこと。**
   * 🔒 入るのは引き取られた識別子（UUID）か `1` だけ。**メールアドレスを入れない。**
   */
  const MERGED_STORAGE_KEY = 'pergram.request_merged';

  /**
   * ブラウザごとの識別子の置き場。
   * 🔒 **ここに入るのはこのブラウザが作った UUID だけ。** メールアドレス・回答・
   *    閲覧履歴を入れない。localStorage はサーバへ送られないが、共用端末では
   *    次の利用者にも読める。
   */
  const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';

  /**
   * **受け口が受け取ったことを確認できた識別子**の置き場（T-062）。
   *
   * 🔒 送るかどうかを決めるのは、識別子があるかではなく**ここに確認があるか**である。
   *    識別子の保存だけで判定していた頃は、最初の1回が失敗したブラウザ（400 / 503 /
   *    通信断）が**以後 何度押しても1行も残せなかった。** しかも画面の反応は成功時と
   *    同じなので、押した人にも運用側にも失敗が伝わらない。
   * 🔒 中身は「確認の取れた識別子そのもの」であって、`1` のような印ではない。
   *    識別子と紐付けておかないと、別の識別子に振り替わったときに古い確認が
   *    そのブラウザを黙らせる。
   * 🔒 SIGNAL_STORAGE_KEY と同じく、入るのはこのブラウザが作った UUID だけ。
   */
  const SIGNAL_ACK_STORAGE_KEY = 'pergram.request_signal_ack';

  /**
   * 受け口が通す「どのページか」の形。`worker/request_signal.js` の `PAGE_ID` と対。
   * 形が合わなければ**送らない**（400 を貰いに行っても得るものが無い）。
   */
  const SIGNAL_PAGE_RE = /^[a-z]{2}:[a-z0-9-]{1,40}$/;

  /** GA4 送信の共通ガード。gtag 未ロード時は何もしない */
  function track(name, params) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
  }

  const flow = document.querySelector('[data-request-flow]');
  const ctas = Array.from(document.querySelectorAll('[data-request-cta]'));
  if (!flow || ctas.length === 0) return;

  const steps = {
    survey: flow.querySelector('[data-request-step="survey"]'),
    email: flow.querySelector('[data-request-step="email"]'),
    support: flow.querySelector('[data-request-step="support"]'),
  };

  const surveyForm = flow.querySelector('[data-request-survey]');
  const emailForm = flow.querySelector('[data-request-email]');

  /** アンケートの回答。メールアドレスの段を送るまでは画面の中にだけ置く */
  let answers = null;

  /* ---- 段の開閉 ------------------------------------------------------- */

  /**
   * 段の状態。`idle`（まだ開いていない）→ `open`（開いている）
   * → `settled`（飛ばした／送り終えた）。
   *
   * 🔒 **`settled` から `open` へは戻さない**（T-053 完了条件 B-5b）。飛ばした段は
   *    器ごと畳んである（collapseStep）ので、要望ボタンを押し直して `hidden` を
   *    外すだけだと、**フォームも完了文言も隠れたままの段が枠だけの空箱として
   *    画面に復活する**。PO が指摘した「空の箱」が2クリックで戻ってしまう。
   * 🔒 閲覧のイベントは `idle` から出るときにだけ送る。`request_survey_view` は
   *    docs/research/validation-plan.md の「成分アンケート回答率」の**分母**であり、
   *    押し直しで二重に数えると回答率が実際より低く出て、広告の撤退判定を誤らせる。
   */
  const stepState = { survey: 'idle', email: 'idle', support: 'idle' };

  function reducedMotion() {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }

  function bringIntoView(el) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /**
   * 段を開く。開いた段の見出しへフォーカスを移す。
   * 見出しを持たない段（支援）では段そのものを見せるだけにする。
   *
   * 戻り値は**この段を初めて見せたか**。呼び出し側はこれを閲覧の数え方に使う。
   *
   * 🔒 **画面へ寄せるのは段そのもの**であって、見出しではない（T-053 / 完了条件 B-6b）。
   *    アンケートの段は見出しより前に礼と依頼の文を持つ（src/templates/request.js）。
   *    見出しを画面上端へ送ると、その文が画面の外へ出て**読まれないまま終わる**。
   * 🔒 フォーカスは見出しへ移したままにする。支援技術の読み上げの起点を変えない
   *    （WCAG 2.4.3）。`preventScroll` に対応しない環境では無視され、
   *    見出しが画面上端へ来る従来の挙動に戻るだけで壊れない。
   */
  function openStep(kind, { focus = true } = {}) {
    const step = steps[kind];
    if (!step) return false;

    // 🔒 決着の付いた段は開き直さない。空の器が復活し、閲覧が二重に数えられる
    if (stepState[kind] === 'settled') return false;

    const firstView = stepState[kind] === 'idle';
    stepState[kind] = 'open';
    step.hidden = false;
    if (!focus) return firstView;

    const heading = step.querySelector('.request-flow__heading');
    bringIntoView(step);
    if (heading && typeof heading.focus === 'function') heading.focus({ preventScroll: true });
    return firstView;
  }

  /**
   * 段の中のフォームを畳み、**段そのものも畳む**。**完了文言は出さない。**
   * 飛ばした（`data-request-skip`）ときはこちらを使う。
   *
   * 🔒 段ごと畳むのは、フォームだけを隠すと**枠と余白だけの空のカードが画面に残る**
   *    ためである（T-053 完了条件 B-5）。完了文言を出す段は finishStep が戻す。
   * 🔒 あわせて段を `settled` にする。要望ボタンを押し直したときに openStep が
   *    畳んだ器を開き直さないため（T-053 完了条件 B-5b）。
   * ⚠️ フォームの `hidden` は維持する。既存テスト「飛ばした段でもフォームは畳まれ、
   *    次の段が開く」がこれを見ている（視覚の修正にテストの書き換えを混ぜない）。
   */
  function collapseStep(kind) {
    const step = steps[kind];
    if (!step) return;
    const form = step.querySelector('.request-form');
    if (form) form.hidden = true;
    step.hidden = true;
    // 🔒 決着を記録する。これが無いと、押し直しで空の器が開き直る（B-5b）
    stepState[kind] = 'settled';
  }

  /**
   * 段の中のフォームを完了状態に切り替える。フォームを畳み、完了の1文を出す。
   *
   * 🔒 **実際に送った段でしか呼ばない。** 飛ばした段で呼ぶと
   *    「登録しました。掲載したらお知らせします。」のような、**サービスが保持して
   *    いないデータを保持していると断言する文**が出る（pergram-ui-copy「事実のみを書く」）。
   * ⚠️ 段を畳むのは collapseStep の役目なので、ここで `hidden` を戻す。
   *    戻し忘れると、送った回答の完了文言が誰にも読まれない（T-053）。
   * ⚠️ 文言は HTML に埋めず `data-request-done` から**ここで書き込む**。
   *    `role="status"` は**中身が変化したときに読み上げられる**ので、最初から
   *    文字が入ったまま hidden を外すだけでは、支援技術に伝わらないことがある。
   */
  function finishStep(kind) {
    const step = steps[kind];
    if (!step) return;
    collapseStep(kind);
    // 🔒 完了文言を読ませる段なので、器は残す（collapseStep が畳んだぶんを戻す）
    step.hidden = false;
    const done = step.querySelector('.request-flow__done');
    if (!done) return;
    done.textContent = done.dataset.requestDone || '';
    done.hidden = false;
  }

  /* ---- 第1段階: 要望ボタン -------------------------------------------- */

  /**
   * 押した本人へのフィードバック。
   * 🔒 ここで数を出さない。出した瞬間に「人気」の表示になる。
   *
   * === 受領メッセージ（T-061 / design.md §4.9）===
   * 🔒 **マイクロコピーと入れ替える。別の場所へ足さない。** 注記の下へ足すと帯が
   *    22.5px 伸び、押した直後にボタンが動く。入れ替えなら帯の高さが変わらない。
   * 🔒 **既に出ていれば何もしない。** `role="status"` は中身が変化したときに読み上げるので、
   *    押し直しで同じ文を書き直すと支援技術が2度読む（完了条件 C-3）。
   * 🔒 **文言はここで書き込む。** HTML に埋めて hidden を外すだけにすると読み上げが飛ぶ
   *    （上の finishStep の ⚠️ と同じ理由）。
   */
  function markReceived(button) {
    const received = button.dataset.labelReceived;
    if (received) button.textContent = received;
    button.classList.add('is-received');
    button.setAttribute('aria-expanded', 'true');

    const band = button.closest('.request-band');
    if (!band) return;
    const slot = band.querySelector('[data-request-received]');
    if (!slot || !slot.hidden) return;
    const note = band.querySelector('[data-request-note]');
    if (note) note.hidden = true;
    const micro = band.querySelector('[data-request-micro]');
    if (micro) micro.hidden = true;
    slot.textContent = slot.dataset.message || '';
    slot.hidden = false;
  }

  /* ---- 匿名シグナル: ブラウザごとに1行だけ残す（T-051） ---------------- */

  /**
   * localStorage は使えないことがある（プライベートモード、Cookie 拒否、
   * 容量超過）。**触るだけで例外が飛ぶ**ので、読み書きの両方を包む。
   * 読めなければ「まだ送っていない」、書けなければ「次も送る」で先へ進む。
   */
  function readStored(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      /* 保存できなくても導線は止めない */
    }
  }

  function removeStored(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      /* 消せなくても導線は止めない */
    }
  }

  /** このブラウザの匿名の行は、もうメールアドレスの行へ引き取られたか（T-072） */
  const isMerged = () => readStored(MERGED_STORAGE_KEY) !== null;

  const writeSignalId = (id) => writeStored(SIGNAL_STORAGE_KEY, id);
  /** 受け口が受け取った id。**応答を見てから**呼ぶ（T-062） */
  const writeSignalAck = (id) => writeStored(SIGNAL_ACK_STORAGE_KEY, id);

  /**
   * 匿名の識別子。`crypto.randomUUID()` が無い環境では**作らない**。
   *
   * 🔒 独自の疑似乱数で代用しない。衝突すればサーバ側で1行に潰れ、
   *    「何人が意思表示したか」が静かに目減りする。**送らないほうがまだ読める**
   *    （GA4 の request_click が残っており、こちらは 0 件になるだけ）。
   */
  function newSignalId() {
    return window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : null;
  }

  /** 同じページで2回以上送らないための鍵。ボタンは2箇所にある */
  let signalSent = false;

  /**
   * このブラウザの識別子。押下のときに決まり、**アンケートの回答も同じものを使う**（T-070）。
   *
   * 🔒 アンケート専用の識別子を作らない。別の値で送ると同じブラウザが2人に見え、
   *    受け口の主キーによる上書きも効かなくなる（何度答えても行が増える）。
   * 🔒 ここが空のときは**送らない**。newSignalId() と同じ理由で、
   *    疑似乱数を自作して埋めない（衝突すれば行が潰れ、回答が静かに目減りする）。
   */
  let signalId = null;

  /** 押下時に決まった識別子。決まっていなければ localStorage の保存分を使う */
  function currentSignalId() {
    return signalId || readStored(SIGNAL_STORAGE_KEY);
  }

  /**
   * 第1段階の押下をサーバへ1行残す。
   *
   * 🔒 **応答を待たない。失敗しても握り潰す。** 段の開閉はこの結果に依存しない。
   * 🔒 送るのは `{ id, page }` だけ。**成分・自由記述・ページ内の位置を混ぜない。**
   *    `page` は「どのページか」まで（`ja:lp` / `ja:protein`）で、上の帯か下の帯かは
   *    入れない。位置の区別は GA4 の location（`data-cta`）が持つ。
   * ⚠️ `page` は T-051 の後に PO 判断で足された（T-058、2026-09-08）。
   *    「送るのは id だけ」へ書き戻さないこと。受け口は page の無い本文を 400 で捨てる。
   * 🔒 送信前に id を保存する。**送信後にすると、応答が返らなかった回が
   *    次回に別の UUID で数え直され、同じブラウザが2人に見える。**
   *    取りこぼす側（控えめな数字）へ倒すのが正しい。
   * 🔒 **送るかどうかは「id があるか」ではなく「受領の確認が取れているか」で決める**
   *    （T-062）。id の有無で判定していた頃は、最初の1回が失敗したブラウザが以後
   *    永久に1行も残せなかった。確認が取れるまでは**同じ id で送り直す。**
   *    受け口は `INSERT OR IGNORE` なので、送り直しても行は増えない。
   * 🔒 送り直しで新しい id を作らない。1つのブラウザが生涯に持つ id は1つだけである。
   * ⚠️ 送り直しの回数に上限を設けていない。**押下1回につき送信は高々1回**（signalSent）
   *    で、押下そのものが利用者の意思による稀な操作なので、上限が守るものが無い。
   *    むしろ上限を持つと、それを数え切ったブラウザが**また永久に黙る** —
   *    いま直している欠陥そのものが形を変えて戻る。
   */
  function sendRequestSignal() {
    if (signalSent) return;
    signalSent = true;

    // どのページかが読めなければ送らない。受け口が 400 で捨てる本文なので、
    // 投げても行は増えず、ブラウザ側の識別子だけが消費される
    const page = flow.dataset.requestPage || '';
    if (!SIGNAL_PAGE_RE.test(page)) return;

    const stored = readStored(SIGNAL_STORAGE_KEY);

    // 🔒 保存済みがあればそれを使い回す。ここで作り直すと同じブラウザが2人になる
    const id = stored || newSignalId();
    if (!id) return;
    if (!stored) writeSignalId(id);

    // アンケートの回答は同じ id で送る（T-070）ので、ここで控えておく。
    // ⚠️ 受領済みで送信を打ち切る回（すぐ下の early return）でも、この行は通る。
    //    なお currentSignalId() が localStorage を読み直すため、この行が無くても
    //    今のところ同じ結果になる。**識別子の出所を「押下のときに決まった値」に
    //    一本化しておくためのもの**であって、冗長さを承知で置いてある
    signalId = id;

    // このブラウザの押下は既にサーバへ入っている。2回目以降は送らない（段は開く）
    if (readStored(SIGNAL_ACK_STORAGE_KEY) === id) return;

    // `.catch()` が拾うのは**拒否されたときだけ**である。fetch を持たない環境や
    // 引数を受け付けない環境では**その場で投げる**ので、同期の側も包む
    try {
      fetch(SIGNAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, page }),
        keepalive: true,
      })
        .then((res) => {
          // 🔒 **受け取られたときにだけ**確認を残す。ここを「応答が返ってきたら」に
          //    緩めると、400 を返され続けるブラウザが黙ったままになる
          if (res && res.ok) writeSignalAck(id);
        })
        .catch(() => {
          /* 計測の都合。ユーザーには何も見せない。次の押下で送り直す */
        });
    } catch (err) {
      /* 同上。導線は既に開いている */
    }
  }

  ctas.forEach((button) => {
    button.addEventListener('click', () => {
      // 位置（絞り込みの近く / リストの末尾 / LP）を分けて数える。文言では分けない
      track('request_click', { location: button.dataset.cta || '(none)' });
      ctas.forEach(markReceived);

      // 🔒 **段を開くのが先。** 匿名シグナルの保存は計測の都合であって
      //    ユーザーの用ではない（T-051 ## 判断してよい範囲）。送信の側で
      //    例外が出ても導線が止まらないよう、順序で担保しておく
      const opened = openStep('survey');
      if (opened) track('request_survey_view', {});

      sendRequestSignal();
    });
  });

  /* ---- 第2段階: アンケート（任意） ------------------------------------ */

  function checkedValues(form, name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(
      (input) => input.value,
    );
  }

  /** 自由記述。空欄は null にして、送信本文に空文字を混ぜない */
  function fieldValue(form, name) {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return null;
    const value = el.value.trim();
    return value === '' ? null : value;
  }

  /**
   * 受け口へ実際に投げる。**応答を待たない。**
   *
   * 受領できたら控え（出荷箱）を消す。ここが「消す条件」の唯一の場所である。
   *
   * 🔒 **消してよいのは 2xx（受領された）と 4xx（本文が受け付けられない）だけ。**
   *    通信断と 5xx では**消さない** —— サーバ側の一時的な事情なので、次の訪問で
   *    送り直せば入る。ここを「応答が返ってきたら消す」に緩めると、
   *    移行前のデプロイで 503 が返る窓（`docs/ops/deploy.md` §3）に当たった回答が
   *    そのまま消える。
   * ⚠️ 4xx で消すのは、**同じ本文を何度投げても永久に受け付けられない**ためである。
   *    残しても毎回の訪問で 400 を貰いに行くだけで、回答は1行も増えない。
   *
   * @param {object} payload 受け口へ送る本文（キー集合ちょうど一致）
   */
  function postRequestSurvey(payload) {
    // `.catch()` が拾うのは拒否されたときだけ。fetch を持たない環境では
    // その場で投げるので、同期の側も包む（sendRequestSignal と同じ）
    try {
      fetch(SURVEY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then((res) => {
          if (!res) return;
          // 🔒 受領された。**控えは必ず消す**（永続的な記録にしない。T-070 の裁定の付帯条件）
          if (res.ok) removeStored(SURVEY_OUTBOX_KEY);
          // この本文は何度送っても通らない。残すと毎回 400 を貰いに行くだけになる
          else if (res.status >= 400 && res.status < 500) removeStored(SURVEY_OUTBOX_KEY);
          // 5xx は消さない。次の訪問で送り直す
        })
        .catch(() => {
          /* 通信断。控えは残したまま次の訪問へ回す */
        });
    } catch (err) {
      /* 同上。導線は既に次の段へ進んでいる */
    }
  }

  /**
   * アンケートの回答を匿名の1行として残す（T-070）。
   *
   * 🔒 **応答を待たない。失敗しても導線は止めない。** 段の開閉はこの結果に依存しない
   *    （sendRequestSignal と同じ方針）。
   * 🔒 送るのは押下と同じ識別子。無ければ**送らない**（作り直さない）。
   * 🔒 本文にメールアドレスを入れない。`page` も入れない。キーを増やすと受け口が
   *    400 で捨てる（キー集合ちょうど一致）。
   * 🔒 **投げる前に控える。** 送信中にページを閉じられても、次の訪問で送り直せる。
   *    ⚠️ 以前ここには「送り直しの仕掛けは持たない」と書いてあった。**その判断は
   *    覆っている**（T-070 のレビュー R-1 とオーケストレーターの裁定、2026-09-08）。
   *    アンケートの段は送信後に `settled` になり開き直せないので（T-053 B-5b）、
   *    撃ちっぱなしだと**そのページ内に再送の機会が一切なく、失敗した回答が
   *    そのまま失われる。** 「回答が捨てられている」を直すこのタスクが、
   *    残った経路で同じことを起こしてはならない。**戻さないこと。**
   *
   * @param {{nutrients: string[], channel: string[], nutrients_other: string|null,
   *          requests: string|null}} answer
   */
  function sendRequestSurvey(answer) {
    const id = currentSignalId();
    if (!id) return;

    const payload = {
      id,
      nutrients: answer.nutrients,
      channel: answer.channel,
      nutrients_other: answer.nutrients_other,
      requests: answer.requests,
    };

    // 🔒 **送る前に控える。** 送信中の離脱・通信断・移行前の 503 を、次の訪問で拾い直す
    writeStored(SURVEY_OUTBOX_KEY, JSON.stringify(payload));

    // 🔒 引き取り済みのブラウザは、**ここで打ち切る**（T-072 / D-1）。匿名の受け口へ送ると
    //    匿名の行が作り直され、同じ人が2行に戻る。
    //    ⚠️ **打ち切りは控えを書いた後ろに置くこと。** 手前に置くと、先にメールアドレスだけを
    //    登録した人が**あとから初めて答えた回答**が、送信も控えも無いまま消える（D-2 / m-5）。
    //    控えに残しておけば、次に待機リストの登録が成功したときに `/api/waitlist` の
    //    送信本文へ相乗りする（メールの段の送信を見ること）。**手前へ戻さないこと。**
    if (isMerged()) return;

    postRequestSurvey(payload);
  }

  /**
   * 控え（出荷箱）を読んで、**形だけを整えて**返す。読めなければ null。
   *
   * 🔒 **中身は一切見ない**（N-01 / N-05。自由記述をコードで解釈しない）。
   *    整えるのは、受け口がキー集合ちょうど一致でしか受け取らないためであって、
   *    検閲ではない —— 形の崩れた控えをそのまま投げると永久に 400 を貰い続ける。
   *
   * @returns {{id: string, answers: {nutrients: string[], channel: string[],
   *   nutrients_other: string|null, requests: string|null}} | null}
   */
  function readSurveyOutbox() {
    const raw = readStored(SURVEY_OUTBOX_KEY);
    if (!raw) return null;

    let saved = null;
    try {
      saved = JSON.parse(raw);
    } catch (err) {
      saved = null;
    }
    if (!saved || typeof saved !== 'object' || typeof saved.id !== 'string') return null;

    return {
      id: saved.id,
      answers: {
        nutrients: Array.isArray(saved.nutrients) ? saved.nutrients : [],
        channel: Array.isArray(saved.channel) ? saved.channel : [],
        nutrients_other: typeof saved.nutrients_other === 'string' ? saved.nutrients_other : null,
        requests: typeof saved.requests === 'string' ? saved.requests : null,
      },
    };
  }

  /**
   * 前回までに送りきれなかった回答を送り直す（T-070 / R-1 の裁定）。
   *
   * 🔒 **形だけを整えて送る。中身は一切見ない**（N-01 / N-05。自由記述を
   *    コードで解釈しない）。整えるのはキー集合を合わせるためであって、
   *    検閲ではない —— 受け口はキー集合ちょうど一致でしか受け取らないので、
   *    形の崩れた控えをそのまま投げると永久に 400 を貰い続ける。
   * 🔒 読めない控えは消す。**読めないものを抱えたままにすると、毎回の訪問で
   *    無駄な送信が走り続ける。**
   */
  function flushRequestSurveyOutbox() {
    const raw = readStored(SURVEY_OUTBOX_KEY);
    if (!raw) return;

    // 🔒 引き取り済みなら**送らない**（T-072 / D-1）。送り直すと匿名の行が作り直され、
    //    同じ人が2行に戻る。
    // 🔒 **ただし控えは消さない**（D-2 / m-5）。引き取りの後に答えた回答がここに入っている
    //    ことがあり、消すと**その人の最初の回答が1文字も残らない。**
    //    次に待機リストの登録が成功したときに `/api/waitlist` の本文へ相乗りし、
    //    そこで初めて消える（消す条件は `postRequestSurvey` とメールの段の2箇所だけ）。
    //    ⚠️ 毎回の訪問でここを通るが、**送信は起きない**ので費用は掛からない
    if (isMerged()) return;

    const saved = readSurveyOutbox();
    if (!saved) {
      removeStored(SURVEY_OUTBOX_KEY);
      return;
    }

    postRequestSurvey({ id: saved.id, ...saved.answers });
  }

  function toEmailStep() {
    const opened = openStep('email');
    if (opened) track('request_email_view', {});
  }

  function toSupportStep() {
    const opened = openStep('support');
    if (opened) track('request_support_view', {});
  }

  if (surveyForm) {
    // 「その他」に書いたのにチップを選び忘れる、を防ぐ（LP のフォームと同じ）。
    // 逆（チップを外したら本文を消す）はやらない — 書いたものを勝手に捨てない
    const otherText = surveyForm.querySelector('[name="nutrients_other"]');
    const otherCheck = surveyForm.querySelector('input[name="nutrients"][value="other"]');
    if (otherText && otherCheck) {
      otherText.addEventListener('input', () => {
        if (otherText.value.trim() !== '') otherCheck.checked = true;
      });
      otherCheck.addEventListener('change', () => {
        if (otherCheck.checked) otherText.focus();
      });
    }

    surveyForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const nutrients = checkedValues(surveyForm, 'nutrients');
      const channel = checkedValues(surveyForm, 'channel');
      const nutrientsOther = fieldValue(surveyForm, 'nutrients_other');
      const requests = fieldValue(surveyForm, 'requests');
      answers = { nutrients, channel, nutrients_other: nutrientsOther, requests };

      // 🔒 自由記述は**本文を送らない**。書かれたかどうかだけを数える
      //    （症状や固有名詞が GA4 に流れる経路を作らない）
      track('request_survey_submit', {
        selected_nutrients: nutrients.join(',') || '(none)',
        purchase_channel: channel.join(',') || '(none)',
        has_nutrients_other: nutrientsOther ? 1 : 0,
        has_requests: requests ? 1 : 0,
      });

      // 🔒 **段を進めるのが先。** 保存は計測の都合であって利用者の用ではない
      //    （押下の匿名シグナルと同じ順序で担保する）
      finishStep('survey');
      toEmailStep();

      // 🔒 メールアドレスを入れない人の回答は、以前ここが無くて全部捨てられていた（T-070）
      sendRequestSurvey(answers);
    });
  }

  /* ---- 第3段階: メールアドレス（任意） -------------------------------- */

  function showError(form, message) {
    const errorEl = form.querySelector('.request-form__error');
    if (!errorEl || !message) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(form) {
    const errorEl = form.querySelector('.request-form__error');
    if (errorEl) errorEl.hidden = true;
  }

  /** 待機リストへの送信。応答が返らないまま押せない状態が続くのを時間で打ち切る */
  function postWaitlist(payload) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    return fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error('request_failed');
        return res;
      })
      .finally(() => {
        if (timer !== null) window.clearTimeout(timer);
      });
  }

  if (emailForm) {
    emailForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearError(emailForm);

      const input = emailForm.querySelector('input[type="email"]');
      const email = input ? input.value.trim() : '';
      if (!EMAIL_RE.test(email)) {
        showError(emailForm, emailForm.dataset.errorEmail);
        if (input) input.focus();
        return;
      }

      const button = emailForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;

      // 🔒 保存に回るのはこの6列の範囲だけ。何も答えていなければ
      //    メールアドレスだけを送る（Worker は空で既存の回答を上書きしない）。
      //
      // このセッションで答えていなければ、**前の訪問で送りきれなかった控え**を載せる
      // （T-072 / D-1）。載せずに控えを残すと、次の訪問で匿名の受け口へ送り直され、
      // 匿名の行が作り直されて同じ人が2行に戻る。かといって黙って捨てると
      // **前の訪問の回答が失われる**（T-070 が直した壊れ方そのもの）。
      // **送り先を匿名の受け口からこちらへ移す**のが、どちらも起こさない唯一の形である。
      // 🔒 載せるのは控えの回答4項目だけ。控えの `id` は載せない
      //    （識別子は下で `signal_id` として1つだけ添える）。
      const carriedAnswers = answers || readSurveyOutbox()?.answers || null;

      const payload = { email };
      if (carriedAnswers) {
        payload.nutrients = carriedAnswers.nutrients;
        payload.channel = carriedAnswers.channel;
        payload.nutrients_other = carriedAnswers.nutrients_other;
        payload.requests = carriedAnswers.requests;
      }

      // このブラウザの匿名の識別子を添える（T-072 / PO 指摘 2026-09-09）。
      //
      // 受け口は、これと同じ識別子で作られた**匿名のアンケートの行を引き取り、
      // その識別子を捨てて**メールアドレスの1行にまとめる。添えないと、
      // 同じ人の回答が2行に分かれ、「クレアチンを見たい人」を数えるときに
      // **同じ人を2回数える**（docs/research/validation-plan.md の判定に効く）。
      //
      // 🔒 **保存される1行が識別子とメールアドレスを同時に持つわけではない。**
      //    受け口は `id` 列へ何も書かない（表の CHECK 制約が最後の砦）。
      //    「送信本文に混ぜない」へ書き戻さないこと —— 行を2つに分ける設計は
      //    T-072 の PO 指摘で失効している。
      // 🔒 無ければ**キーごと送らない。**空文字や自作の疑似乱数で埋めない
      //    （識別子を作れない環境でも登録は通る。受け口では任意項目）。
      const carriedSignalId = currentSignalId();
      if (carriedSignalId) payload.signal_id = carriedSignalId;

      postWaitlist(payload)
        .then(() => {
          // 🔒 **ここで匿名の経路を閉じる**（T-072 / D-1）。受け口は、この登録で
          //    匿名の行を引き取り、識別子を捨てて1行にまとめた。以後この識別子で
          //    匿名の受け口へ送ると、**匿名の行が作り直されて同じ人が2行に戻る。**
          //    控えも消す —— 中身は今の送信本文に載せてサーバへ渡してある。
          // 🔒 **成功したときだけ。** 失敗した回で閉じると、回答が匿名の受け口へも
          //    メールの行へも届かないまま、控えだけが消える。
          // 🔒 印に入れるのは識別子か `1` だけ。**メールアドレスを入れない。**
          writeStored(MERGED_STORAGE_KEY, carriedSignalId || '1');
          removeStored(SURVEY_OUTBOX_KEY);

          // 🔒 メールアドレスは送らない。登録できたという事実だけを数える
          track('request_email_submit', {});
          // 🔒 **この名前を消さない。** docs/ops/google-ads-first-campaign.md (0-4) で
          //    Google 広告のコンバージョンとしてインポート済みの名前である。送る箇所が
          //    無くなっても広告側はエラーにならず、**0 件のまま静かに記録され続ける**
          //    （T-047 と同じ壊れ方）。request_email_submit とは別に、名前の連続性の
          //    ためだけに残す。パラメータは持たせない（個人識別情報を載せる隙を作らない）。
          track('waitlist_submit', {});
          finishStep('email');
          toSupportStep();
        })
        .catch(() => {
          if (button) button.disabled = false;
          showError(emailForm, emailForm.dataset.errorSend);
        });
    });
  }

  /* ---- 段を飛ばす ------------------------------------------------------ */

  document.querySelectorAll('[data-request-skip]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.requestSkip;
      track(kind === 'survey' ? 'request_survey_skip' : 'request_email_skip', {});
      // 🔒 完了文言を出さない。飛ばした段では**何も起きていない**
      collapseStep(kind);
      if (kind === 'survey') toEmailStep();
      else toSupportStep();
    });
  });

  /* ---- 前回送りきれなかった回答を拾い直す（T-070 / R-1） --------------- */

  /*
   * 🔒 **再送の契機はページの読み込みである。** アンケートの段は送信後に `settled` に
   *    なり開き直せない（T-053 B-5b）ので、**そのページ内には再送の機会が無い。**
   *    ここを消すと、通信断や 503 に当たった回答が永久に失われる（R-1 が指摘した欠陥）。
   * ⚠️ 押下や送信の操作を待たない。控えが無ければ何も起きない（送信も走らない）ので、
   *    通常の訪問に費用は掛からない。
   */
  flushRequestSurveyOutbox();
})();
