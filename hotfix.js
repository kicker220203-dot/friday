// Friday v0.5.2 hotfix layer.
// Loaded after app.js so these declarations replace v0.5.1 behavior without touching stored user data.

let v052PendingVoiceIntent = null;
let v052PanelActionLockUntil = 0;

function armSession(){
  if(!sessionActive||!settings.voiceSession||isSleeping||menuOpen()||panelOpen()) return;
  clearTimeout(sessionTimer);
  sessionTimer=setTimeout(()=>{
    if(sessionActive&&!isSpeaking&&!isListening&&!isSleeping&&!menuOpen()&&!panelOpen()){
      startListening(false,true,0);
    }
  },900);
}

function setupRecognition(fromSession){
  if(!SpeechRecognition) return null;
  const r=new SpeechRecognition();
  let silentEnd=false, gotFinal=false;
  r.lang='ru-RU';
  r.continuous=false;
  r.interimResults=true;
  r.maxAlternatives=1;

  r.onstart=()=>{
    isListening=true;
    if(!isSleeping&&!menuOpen()&&!panelOpen()) setState('listening');
    maybeStatus(micTestMode?'Тест микрофона: говори.':'Слушаю...',micTestMode||settings.diagnostics,1400);
    clearTimeout(listenWatchdog);
    listenWatchdog=setTimeout(()=>{
      if(!isListening) return;
      if(fromSession){
        silentEnd=true;
        sessionActive=false;
        try{r.abort()}catch{}
        isListening=false;
        setState('idle');
        return;
      }
      try{r.stop()}catch{}
      isListening=false;
      speak('Не расслышала.',{continueSession:false});
    },settings.sessionWindowSec*1000);
  };

  r.onresult=e=>{
    let finalText='', interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const p=e.results[i][0]?.transcript||'';
      if(e.results[i].isFinal) finalText+=p; else interim+=p;
    }
    const heard=(finalText||interim).trim();
    if(heard) maybeStatus(`Слышу: ${heard}`,micTestMode||settings.diagnostics,1800);
    if(!finalText) return;
    gotFinal=true;
    clearTimeout(listenWatchdog);
    isListening=false;
    const tr=finalText.trim();
    if(!tr){
      if(fromSession){endSession();return;}
      return speak(pick(messages.noSpeech));
    }
    handleVoiceCommand(tr);
  };

  r.onerror=e=>{
    clearTimeout(listenWatchdog);
    isListening=false;
    if(silentEnd) return;
    if(fromSession&&e.error!=='not-allowed'&&e.error!=='service-not-allowed'){
      endSession();
      return;
    }
    const msg=(e.error==='not-allowed'||e.error==='service-not-allowed')
      ?'Мне нужен доступ к микрофону.'
      :e.error==='no-speech'?pick(messages.noSpeech)
      :'Микрофон сейчас не сработал.';
    speak(msg,{continueSession:false});
  };

  r.onend=()=>{
    clearTimeout(listenWatchdog);
    isListening=false;
    if(fromSession&&!gotFinal&&!silentEnd) endSession();
    if(!isSleeping&&!menuOpen()&&!panelOpen()&&!isSpeaking) setState('idle');
  };
  return r;
}

function startListening(test=false,fromSession=false,retry=0){
  if(isSpeaking) stopAllVoice();
  if(!SpeechRecognition) return speak('Голосовое управление недоступно в этом браузере.');
  if(isSleeping) wake(false);
  closeMenu(true);
  closePanel(true);
  micTestMode=test;
  if(!fromSession&&!test) sessionActive=settings.voiceSession;
  try{
    recognition=setupRecognition(fromSession);
    if(!recognition) return;
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.resume();
    isSpeaking=false;
    setState('listening');
    recognition.start();
  }catch{
    isListening=false;
    if(fromSession&&retry<1&&sessionActive){
      setTimeout(()=>startListening(false,true,retry+1),650);
      return;
    }
    if(fromSession){endSession();return;}
    setState('confused');
    speak('Микрофон занят. Попробуй ещё раз.');
  }
}

function renderSettings(){
  const sel=n=>settings.sessionWindowSec===n?'selected':'';
  const html=`<div class="item"><div class="item-title">Голосовая сессия</div><div class="small">После ответа Пятница снова слушает без нового двойного тапа.</div><button data-panel-action="toggle-session">${settings.voiceSession?'Включена':'Выключена'}</button></div><div class="item"><div class="item-title">Ожидание продолжения</div><div class="small">Сейчас: ${settings.sessionWindowSec} сек.</div><div class="row"><button class="${sel(5)}" data-panel-action="session-5">5 сек</button><button class="${sel(7)}" data-panel-action="session-7">7 сек</button><button class="${sel(10)}" data-panel-action="session-10">10 сек</button></div></div><div class="item"><div class="item-title">Диагностика</div><div class="small">Показывать распознанный текст и технические статусы.</div><button data-panel-action="toggle-diag">${settings.diagnostics?'Включена':'Выключена'}</button></div><div class="item"><div class="item-title">Данные</div><button data-panel-action="clear-timers">Очистить таймеры</button><button class="danger" data-panel-action="clear-memory">Очистить память</button></div><div class="item"><div class="item-title">Wake word</div><div class="small">Постоянное «Пятница» пока выключено в PWA. Начало разговора — двойной тап.</div></div><div class="item"><div class="item-title">AI</div><div class="small">Не подключён. Для безопасного подключения нужен backend-прокси.</div></div>`;
  openPanel('Настройки',html,false);
}

function handleVoiceCommand(raw){
  const text=normalize(raw);
  if(micTestMode){micTestMode=false;return speak(`Я услышала: ${raw}.`);}
  if(includesAny(text,['стоп','замолчи','остановись','хватит'])){v052PendingVoiceIntent=null;stopAllVoice();return;}
  if(includesAny(text,['отбой','всё','все','до связи','закончить'])){v052PendingVoiceIntent=null;endSession();return speak('Отбой.');}

  if(v052PendingVoiceIntent?.type==='timer-duration'){
    const sec=parseDuration(raw);
    if(sec){
      const label=v052PendingVoiceIntent.label;
      v052PendingVoiceIntent=null;
      return createTimer(sec,label);
    }
    if(includesAny(text,['отмена','отмени','не надо'])){
      v052PendingVoiceIntent=null;
      return speak('Хорошо, таймер не ставлю.',{continueSession:true});
    }
    v052PendingVoiceIntent=null;
  }

  if(includesAny(text,['повтори','повтор'])) return speak(lastAnswer,{continueSession:true});
  if(includesAny(text,['спать','усни','засыпай'])) return speak('Ушла в сон.').then(()=>sleep(false));
  if(includesAny(text,['проснись','вставай'])){isSleeping=false;setState('attentive');return speak('Уже здесь.',{continueSession:true});}
  if(includesAny(text,['тихий режим','потише'])){applyMode('quiet',true);return speak('Тихий режим.',{continueSession:true});}
  if(includesAny(text,['рабочий режим','соберись'])){applyMode('work',true);return speak('Рабочий режим.',{continueSession:true});}
  if(includesAny(text,['обычный режим','нормальный режим'])){applyMode('normal',true);return speak('Обычный режим.',{continueSession:true});}

  if(includesAny(text,['который час','который сейчас час','сколько времени','сколько сейчас времени','сколько время','сколько сейчас время','время сейчас','текущее время'])) return speak(getTimeText(),{continueSession:true});
  if(includesAny(text,['какое сегодня число','какое число','какая дата','какая сегодня дата','сегодняшняя дата','дата сегодня','какой сегодня день'])) return speak(getDateText(),{continueSession:true});

  if(includesAny(text,['сколько осталось','сколько там осталось'])){
    const q=raw.replace(/сколько( там)? осталось/ig,'').trim();
    return timerStatus(q);
  }
  if(includesAny(text,['отмени таймер','убери таймер','сбрось таймер','удали таймер'])){
    const q=raw.replace(/отмени таймер|убери таймер|сбрось таймер|удали таймер/ig,'').trim();
    return cancelTimer(q);
  }
  if(includesAny(text,['поставь таймер','поставить таймер','засеки','таймер на','создай таймер','запусти таймер','заведи таймер','отсчитай'])||text==='таймер'){
    const sec=parseDuration(raw), label=extractTimerLabel(raw);
    if(!sec){
      v052PendingVoiceIntent={type:'timer-duration',label};
      return speak(label==='без названия'?'На сколько поставить таймер?':`На сколько поставить таймер «${label}»?`,{continueSession:true});
    }
    return createTimer(sec,label);
  }

  if(includesAny(text,['что ты умеешь','помощь','команды'])) return speak(abilitiesText(),{continueSession:true});
  if(includesAny(text,['режимы'])) return speak('Обычный, рабочий, тихий, сон и Вторник Lite.',{continueSession:true});
  if(text.startsWith('запомни')||text.startsWith('сохрани')||text.startsWith('не забудь')) return addMemory(raw);
  if(includesAny(text,['что ты помнишь','что в памяти'])){
    const q=raw.replace(/что ты помнишь|что в памяти/ig,'').replace(/^\s*(о|об|про)\s*/i,'').trim();
    return listMemory(q);
  }
  if(text.startsWith('забудь')||text.startsWith('удали из памяти')){
    const q=raw.replace(/^(забудь|удали из памяти)\s*/i,'').trim();
    return forgetMemory(q);
  }
  if(includesAny(text,['открой меню','меню'])) return speak('Открываю меню.').then(openMenu);
  if(includesAny(text,['вторник'])) return tuesdayLite();
  if(includesAny(text,['верни пятницу','пятница обратно'])) return backToFriday();
  if(persona==='tuesday') return speak(tuesdayAnalyze(raw),{continueSession:true});
  if(includesAny(text,['ai','искусственный интеллект','чат'])) return speak('AI пока не подключён. Для него нужен безопасный backend.',{continueSession:true});
  if(text==='пятница'||text.endsWith(' пятница')) return speak(pick(messages.tap),{continueSession:true});
  setState('confused');
  return speak('Пока не умею. Скажи: что ты умеешь.',{continueSession:true});
}

function renderAbout(){
  openPanel('О версии','<div class="item"><div class="item-title">Пятница v0.5.2-hotfix</div><div>Исправления голосовой сессии, команд, таймеров и настроек.</div><div class="item-meta">Тихое завершение сессии • больше вариантов команд • двухшаговый таймер • исправленные настройки</div></div>',false);
}

panelCard.addEventListener('pointerup',e=>{
  const b=e.target.closest('button[data-panel-action]');
  if(!b) return;
  e.preventDefault();
  e.stopPropagation();
  v052PanelActionLockUntil=Date.now()+450;
  panelAction(b.dataset.panelAction);
},{passive:false});

panelCard.addEventListener('click',e=>{
  if(Date.now()<v052PanelActionLockUntil){
    e.preventDefault();
    e.stopImmediatePropagation();
  }
},true);

document.title='Пятница v0.5.2-hotfix';
document.querySelectorAll('.voice-title,.menu-title').forEach(el=>{if(el.textContent.includes('Пятница'))el.textContent='Пятница v0.5.2-hotfix';});
const v052Style=document.createElement('style');
v052Style.textContent='button.selected{background:rgba(65,199,255,.18);border-color:rgba(126,228,255,.52);box-shadow:0 0 0 1px rgba(65,199,255,.08) inset}';
document.head.appendChild(v052Style);
