// ─── i18n.js ───────────────────────────────────────────────────────────────────
// Локализация интерфейса Love Score. Язык берётся из настройки языка SillyTavern:
// расширение написано по-русски, и если в таверне выбран НЕ русский язык —
// интерфейс показывается на английском (английский — фолбэк для всех не-русских
// локалей: en, ja, de, fr и т.д.).
//
// Принцип: исходные строки в коде остаются русскими, перевод применяется к уже
// отрисованному DOM (translateTree / observeTree) и к строкам уведомлений (tr).
// Перевод идёт по ТОЧНОМУ совпадению строки — неизвестные строки остаются как
// есть, ничего не ломается, искажений внутри слов не возникает.

// SillyTavern хранит выбранный язык в localStorage под ключом 'language'
// (та же логика, что в public/scripts/i18n.js). Читаем напрямую, чтобы не
// зависеть от относительного пути импорта движка таверны.
function rawLocale() {
  try {
    return String(
      localStorage.getItem('language') ||
      navigator.language ||
      navigator.userLanguage ||
      'en'
    ).toLowerCase();
  } catch {
    return 'en';
  }
}

// Английский интерфейс показываем, когда таверна НЕ на русском.
export function isEnglishUI() {
  return !rawLocale().startsWith('ru');
}

const CYR = /[А-Яа-яЁё]/;

// ─── Словарь RU → EN ─────────────────────────────────────────────────────────
// Ключ — точная русская строка (текст узла, значение атрибута или текст тоста).
export const DICT = {
  // ── Типы отношений (config.js: RELATION_TYPES.label) ──
  'Нейтрально': 'Neutral',
  'Романтика': 'Romance',
  'Дружба': 'Friendship',
  'Семья': 'Family',
  'Платоника': 'Platonic',
  'Соперник': 'Rival',
  'Одержимость': 'Obsession',
  'Ненависть': 'Hatred',

  // ── Описания типов (config.js: RELATION_TYPES.desc) ──
  'Тип не определён. Отношения только начинаются.': 'Type undefined. The relationship is just beginning.',
  'Влюблённость, страсть, нежность. Особая привязанность.': 'Infatuation, passion, tenderness. A special bond.',
  'Тепло, забота и доверие без романтики.': 'Warmth, care and trust, without romance.',
  'Глубокая привязанность как к близкому человеку.': 'Deep attachment, like to a close family member.',
  'Духовная близость и взаимопонимание без физики.': 'Spiritual closeness and understanding without physical desire.',
  'Уважение через конкуренцию. Напряжённая динамика.': 'Respect through competition. A charged dynamic.',
  'Всепоглощающая фиксация. Тёмная, болезненная привязанность.': 'All-consuming fixation. A dark, painful attachment.',
  'Открытая ненависть и враждебность. Перевёрнутое сердце — символ ненависти.': 'Open hatred and hostility. An inverted heart — the symbol of hate.',

  // ── Майлстоны по умолчанию (config.js: milestones) ──
  'Сделай комплимент или небольшой знак внимания.': 'Give a compliment or a small token of attention.',
  'Предложи встретиться или провести время вместе.': 'Suggest meeting up or spending time together.',
  'Сделай подарок или особый жест.': 'Give a gift or a special gesture.',
  'Впервые открыто признайся в чувствах.': 'Openly confess your feelings for the first time.',
  'Заговори о серьёзных отношениях.': 'Bring up a serious relationship.',
  'Сделай предложение руки и сердца.': 'Propose marriage.',
  'Заговори о совместном будущем.': 'Talk about a shared future.',

  // ── Подсказки / описания блоков (HTML-текст) ──
  'Тяни записи из лорбука главного героя или создавай вручную. Данные хранятся отдельно для каждого чата.': 'Pull entries from the main character’s lorebook or create them manually. Data is stored separately for each chat.',
  'Точки-вехи: при достижении балла модель получит подсказку «сделай Х». Отметка снимается автоматически, когда балл падает ниже порога.': 'Milestones: when the score is reached, the model gets a “do X” hint. The mark clears automatically when the score drops below the threshold.',
  'Можно прикрепить несколько лорбуков. Записи со всех выбранных собираются вместе. Это могут быть базы с описанием мира, персонажей, правил — что угодно.': 'You can attach several lorebooks. Entries from all selected ones are combined. These can be worlds, characters, rules — anything.',
  'Локальная модель: пути вроде http://localhost:1234/v1 (LM Studio), http://127.0.0.1:5000 и т.п. Для облака — полный URL до /v1.': 'Local model: paths like http://localhost:1234/v1 (LM Studio), http://127.0.0.1:5000, etc. For cloud — the full URL up to /v1.',
  'Соперник перетягивает внимание: его рост усиливает давление на счёт игрока, а тёплые сцены с ним мешают вашему прогрессу.': 'A rival pulls focus: their growth increases pressure on the player’s score, and warm scenes with them hinder your progress.',
  'Очки за каждое сообщение почти не растут. Подходит для медленного, выстраданного романа.': 'Points barely grow per message. Good for a slow, hard-won romance.',
  'Можно ввести любой балл вручную. Соперник активнее всего влияет, когда вы рядом по очкам.': 'You can enter any score manually. A rival has the most impact when you are close in points.',
  'Войны окончены. Серьёзострел утихли. Теперь — выбор: примирение или вечная вражда.': 'The wars are over. The gunfire has died down. Now — a choice: reconciliation or eternal enmity.',
  'Управляй тем, как ИИ видит твои отношения. Балл, тип и динамика влияют на поведение персонажа.': 'Control how the AI sees your relationship. Score, type and dynamics affect the character’s behavior.',
  'Здесь появятся твои пресеты. Сохрани текущие настройки как пресет, чтобы переключаться между ними.': 'Your presets will appear here. Save the current settings as a preset to switch between them.',
  'Когда счёт радикально меняется, бот ещё пару ходов «переваривает» событие — реагирует на сдвиг.': 'When the score changes drastically, the bot keeps “processing” the event for a couple of turns — reacting to the shift.',
  'Серия положительных ответов подряд начисляет бонус. Чем длиннее серия — тем больше прирост.': 'A streak of positive responses in a row grants a bonus. The longer the streak — the bigger the gain.',
  'выбери записи лорбука, где описаны персонажи (NPC), отношения с которыми ты хочешь отслеживать': 'select lorebook entries describing the characters (NPCs) whose relationships you want to track',
  'Глубокие обиды оставляют след. Большое падение балла создаёт «шрам», который влияет на поведение.': 'Deep grievances leave a mark. A big score drop creates a “scar” that affects behavior.',
  'Падение очень близких отношений ранит сильнее. Чем выше был балл, тем больнее падение.': 'A fall from a very close relationship hurts more. The higher the score was, the more painful the drop.',
  'Балл ниже нуля — отношения испорчены. Чем глубже минус, тем враждебнее персонаж.': 'Score below zero — the relationship is broken. The deeper the minus, the more hostile the character.',
  'Не показывать боту правила, дельты и вехи — только текущий балл и поведение.': 'Don’t show the bot the rules, deltas and milestones — only the current score and behavior.',
  'Новый чат начинается с холодного старта: балл в минусе, доверие надо заслужить.': 'A new chat starts cold: the score is negative, trust must be earned.',
  'Опиши, как меняется поведение и реакции персонажа в этом диапазоне баллов.': 'Describe how the character’s behavior and reactions change in this score range.',
  'Сюда можно вписать любые пожелания к генерации: стиль, тон, особые правила.': 'You can add any generation preferences here: style, tone, special rules.',
  'Кулдаун между «прорывами»: сколько ходов должно пройти до следующего.': 'Cooldown between “breakthroughs”: how many turns must pass until the next one.',
  'Балл, при котором отношения переходят в эту стадию (и выше, до следующей).': 'The score at which the relationship enters this stage (and above, up to the next one).',
  'Насколько сильно соперник давит на счёт игрока за каждое своё очко.': 'How strongly the rival presses on the player’s score for each of their own points.',
  'Сохрани и активируй пресет, чтобы видеть здесь правила и динамику.': 'Save and activate a preset to see rules and dynamics here.',
  'Порог, ниже которого падение балла за один ход оставляет шрам.': 'The threshold below which a score drop in a single turn leaves a scar.',
  'Опиши, что приводит к такому изменению баллов в этом диапазоне.': 'Describe what leads to this score change in this range.',
  'Маршрут отношений: тип, на котором основан весь сюжетный путь.': 'A relationship route: the type the whole story path is based on.',
  'Сколько последних сообщений чата отправлять модели на анализ.': 'How many of the latest chat messages to send to the model for analysis.',
  'Здесь будут события-вехи. Добавь первую, чтобы начать.': 'Milestone events will be here. Add the first one to begin.',
  'Здесь появятся твои маршруты. Добавь первый, чтобы начать.': 'Your routes will appear here. Add the first one to begin.',
  'Текущий балл отношений. Можно ввести вручную (−100…+100).': 'Current relationship score. Can be entered manually (−100…+100).',
  'на сколько баллов изменится счёт при этом действии (+ или −)': 'how many points the score changes for this action (+ or −)',
  'Насколько персонаж замкнут вначале и как быстро открывается.': 'How withdrawn the character is at first and how quickly they open up.',
  'Сделай первый шаг — добавь правило или сгенерируй набор.': 'Take the first step — add a rule or generate a set.',
  'Имя должно совпадать с тем, как персонаж зовётся в чате.': 'The name must match how the character is called in the chat.',
  'Опционально: ключевые черты, роль, история отношений.': 'Optional: key traits, role, relationship history.',
  'Через сколько ходов простоя баллы начинают остывать.': 'After how many idle turns points start to cool down.',
  'Описание стадии (необязательно, но помогает модели).': 'Stage description (optional, but helps the model).',
  'Сильное изменение баллов, после которого включается эхо.': 'A strong score change after which the echo kicks in.',
  'Геймификация отношений с ИИ-персонажами. Версия 1.7.0.': 'Gamified relationships with AI characters. Version 1.7.0.',
  'Сколько баллов теряется за один шаг простоя (decay).': 'How many points are lost per idle step (decay).',
  'Что должно произойти, чтобы перейти на этот маршрут.': 'What must happen to switch to this route.',
  'Каждый N-й ответ — лёгкая подсказка для следующего хода.': 'Every Nth response — a light hint for the next turn.',
  'Условие появления: тип отношений и диапазон баллов.': 'Trigger condition: relationship type and score range.',
  'Сколько ходов держится эхо-эффект после сдвига.': 'How many turns the echo effect lasts after a shift.',
  'Список соперников и важных персонажей окружения.': 'List of rivals and important surrounding characters.',
  'максимум очков, выше которого отношения не растут': 'the max points above which the relationship doesn’t grow',
  'Стиль текста, который ИИ вписывает в подсказки.': 'The text style the AI uses in its hints.',
  'Кратко опиши, что это за персонаж и ваша история.': 'Briefly describe who this character is and your history.',
  'Минимальная длина серии для активации бонуса.': 'Minimum streak length to activate the bonus.',
  'Сильное падение — глубокий шрам и злопамятность.': 'A heavy fall — a deep scar and a long memory.',
  'Сколько очков добавляет максимальная серия.': 'How many points the maximum streak adds.',
  'текущее число очков и ваш текущий ранг чата': 'current points and your current chat rank',
  'Дополнительные пожелания к генерации (стиль).': 'Extra generation preferences (style).',
  'Тип отношений, на котором основан маршрут.': 'The relationship type the route is based on.',
  'Балл, начиная с которого правило вступает в силу.': 'The score from which the rule takes effect.',
  'Финальная стадия — то, к чему всё идёт.': 'Final stage — what it all leads to.',
  'Здесь пока нет ни соперников, ни NPC.': 'No rivals or NPCs here yet.',
  'Скрыть правила, дельты и вехи от бота.': 'Hide rules, deltas and milestones from the bot.',
  'Эхо после сильного сдвига очков.': 'Echo after a strong score shift.',
  'Очки можно вводить вручную: от −100 до максимума.': 'Points can be entered manually: from −100 to the max.',
  'Бонус за серию положительных ответов.': 'Bonus for a streak of positive responses.',
  'Старт в минусе — доверие надо заслужить.': 'Start in the minus — trust must be earned.',
  'Описание стадии для модели.': 'Stage description for the model.',
  'Добавь свой первый маршрут.': 'Add your first route.',
  'Множитель к следующему приросту.': 'Multiplier for the next gain.',
  'Память о крупных обидах.': 'Memory of major grievances.',
  'Префикс не обязателен.': 'Prefix is optional.',
  'Тип отношений (?)': 'Relationship type (?)',
  'Развилка маршрута.': 'Route fork.',
  'Сложность отношений.': 'Relationship difficulty.',
  'Холодный старт.': 'Cold start.',
  'Без названия.': 'Untitled.',
  'Промежуточная стадия.': 'Intermediate stage.',
  'Поведение по умолчанию.': 'Default behavior.',
  'Стартовая стадия.': 'Starting stage.',
  'Управление шрамами.': 'Scar management.',
  'не задано.': 'not set.',
  'Текущий балл.': 'Current score.',
  'Хардкор-режим.': 'Hardcore mode.',
  'Анализ чата.': 'Chat analysis.',
  'Хардкор.': 'Hardcore.',
  'Маршруты.': 'Routes.',
  'Соперник.': 'Rival.',
  'Стена недоверия.': 'Wall of distrust.',
  'Версия 1.7.0.': 'Version 1.7.0.',
  'Серия (стрик).': 'Streak.',
  'Импульс события.': 'Event momentum.',
  'Окружение и NPC.': 'Surroundings & NPCs.',
  'Базовые правила.': 'Basic rules.',
  'Дельты и пороги.': 'Deltas & thresholds.',
  'Описание стадии.': 'Stage description.',
  'Условие (опц.).': 'Condition (opt.).',
  'Тон подсказок.': 'Hint tone.',

  // ── Заголовки полей / лейблы (HTML-текст) ──
  'Что отслеживаем (?)': 'What we track (?)',
  'Контекст для ИИ': 'Context for the AI',
  'Связанные лорбуки': 'Linked lorebooks',
  'Главный герой (вы)': 'Main character (you)',
  'Источники для генерации': 'Generation sources',
  'Радиус анализа (сообщений)': 'Analysis radius (messages)',
  'Имя персонажа (как в чате)': 'Character name (as in chat)',
  'Имя для промпта (английское)': 'Prompt name (English)',
  'English name (for the prompt)': 'English name (for the prompt)',
  'Видно боту в промпте': 'Visible to the bot in the prompt',
  'Описание (видно боту)': 'Description (visible to the bot)',
  'Тип отношений': 'Relationship type',
  'Достижения': 'Achievements',
  'Сменить тип': 'Change type',
  'Сбросить': 'Reset',
  'Применить': 'Apply',
  'Сохранить': 'Save',
  'Удалить': 'Delete',
  'Закрыть': 'Close',
  'Отмена': 'Cancel',
  'Создать': 'Create',
  'Добавить': 'Add',
  'Импорт': 'Import',
  'Экспорт': 'Export',
  'Открыть': 'Open',
  'Настроить': 'Configure',
  'Назад': 'Back',
  'Готово': 'Done',
  'Очистить': 'Clear',
  'Поиск': 'Search',
  'Анализировать': 'Analyze',
  'Сгенерировать': 'Generate',
  'Перегенерировать': 'Regenerate',
  'Обновить': 'Refresh',
  'Сохранить как пресет': 'Save as preset',
  'Загрузить': 'Load',
  'Тип': 'Type',
  'Балл': 'Score',
  'Имя': 'Name',
  'Очки': 'Points',
  'Порог': 'Threshold',
  'Описание': 'Description',
  'Условие': 'Condition',
  'Действие': 'Action',
  'Изменение': 'Change',
  'Диапазон': 'Range',
  'Маршрут': 'Route',
  'Стадия': 'Stage',
  'Правило': 'Rule',
  'Дельта': 'Delta',
  'Вес': 'Weight',
  'Заметки': 'Notes',
  'Модель': 'Model',
  'Эндпоинт': 'Endpoint',
  'API-ключ': 'API key',
  'Язык': 'Language',
  'Русский': 'Russian',
  'English': 'English',
  'Промпт': 'Prompt',
  'Теги': 'Tags',
  'Авто': 'Auto',
  'Вкл': 'On',
  'Выкл': 'Off',
  'Да': 'Yes',
  'Нет': 'No',
  'Тип отношений: романтика': 'Relationship type: romance',
  'Соперники': 'Rivals',
  'Лорбук': 'Lorebook',
  'Пресет': 'Preset',
  'Пресеты': 'Presets',
  'Вехи': 'Milestones',
  'Шрамы': 'Scars',
  'Без шрамов': 'No scars',
  'Очки отношений': 'Relationship points',
  'Прогресс': 'Progress',
  'Достижение разблокировано': 'Achievement unlocked',

  // ── Атрибуты title / placeholder / aria-label ──
  'Найти упомянутых NPC из лорбука в истории чата': 'Find lorebook NPCs mentioned in the chat history',
  'перетащите, чтобы переместить виджет': 'drag to move the widget',
  'Сбросить все вехи в «не выполнено»': 'Reset all milestones to “not done”',
  'Двойной клик — открыть панель': 'Double-click to open the panel',
  'Удалить этот лорбук из списка': 'Remove this lorebook from the list',
  'Добавить запись лорбука': 'Add a lorebook entry',
  'Сохранить текущие настройки как пресет': 'Save the current settings as a preset',
  'Удалить пресет': 'Delete preset',
  'Загрузить пресет': 'Load preset',
  'Соперник в группе влияет на ваш счёт': 'A rival in the group affects your score',
  'Этот NPC — ваш соперник': 'This NPC is your rival',
  'Добавить правило': 'Add a rule',
  'Добавить стадию': 'Add a stage',
  'Добавить веху': 'Add a milestone',
  'Удалить запись': 'Delete entry',
  'Удалить правило': 'Delete rule',
  'Сбросить балл в ноль': 'Reset the score to zero',
  'Минимальный балл для шрама': 'Minimum score for a scar',
  'Свернуть/развернуть': 'Collapse/expand',
  'Скопировать промпт': 'Copy the prompt',
  'Скопировать теги': 'Copy the tags',
  'Экспортировать пресет': 'Export preset',
  'Импортировать пресет': 'Import preset',
  'Имя соперника или союзника': 'Name of a rival or ally',
  'Удалить этого персонажа': 'Delete this character',
  'Удалить шрам': 'Delete scar',
  'Закрыть панель': 'Close the panel',
  'Очки этого NPC с игроком': 'This NPC’s points with the player',
  'Тип отношений этого NPC': 'This NPC’s relationship type',
  'Сравни с текущим баллом': 'Compare with the current score',
  'этот текст увидит бот в промпте': 'the bot will see this text in the prompt',
  'Бар прогресса отношений': 'Relationship progress bar',
  'Раскрыть/свернуть карточку': 'Expand/collapse the card',
  'Эти теги ИИ вставляет в ответ': 'The AI inserts these tags into its reply',

  // ── Уведомления (toast) и динамические подписи (реальные строки) ──
  'Все события сброшены': 'All milestones reset',
  '🎭 Правила скрыты от бота — только поведение и счёт': '🎭 Rules hidden from the bot — behavior and score only',
  'Правила снова видны боту': 'Rules are visible to the bot again',
  'Промпт скопирован': 'Prompt copied',
  'Теги скопированы': 'Tags copied',
  '☠️ Hardcore включён — набирать очки будет тяжело': '☠️ Hardcore on — earning points will be hard',
  'Hardcore выключен': 'Hardcore off',
  '📝 AI будет писать причину к счёту в лог': '📝 The AI will write the reason for the score in the log',
  'Обоснование в логе выключено': 'Reason in the log is off',

  // ── Селектор типа отношений ──
  '— авто (по чату) —': '— auto (per chat) —',

  // ── Длинные подсказки / описания блоков (HTML-текст, полные узлы) ──
  'Ветки развития по типу отношений. Активной становится та, чей тип совпадает с текущим (любовь, одержимость, охлаждение…) — она задаёт тон сцены и может включать правила только для этой ветки.': 'Development branches by relationship type. The active one is whichever matches the current type (love, obsession, cooling…) — it sets the scene’s tone and can include rules just for that branch.',
  'Отслеживай отношения с несколькими персонажами. Тяни записи из лорбука главного героя или создавай вручную. Данные хранятся отдельно для каждого чата.': 'Track relationships with several characters. Pull entries from the main character’s lorebook or create them manually. Data is stored separately for each chat.',
  'ИИ создаёт по ветке на каждый тип отношений под этого персонажа (любовь, одержимость, дружба…). Заменяет текущие маршруты. Источник — из вкладки AI.': 'The AI creates one branch per relationship type for this character (love, obsession, friendship…). Replaces the current routes. Source — from the AI tab.',
  'Генерирует только события, растягивая пороги до указанного значения. Правила и диапазоны не трогаются. Источник берётся из вкладки AI.': 'Generates events only, stretching the thresholds up to the given value. Rules and ranges are left untouched. Source is taken from the AI tab.',
  'Крупное падение оставляет шрам — персонаж помнит обиду даже после примирения. AI может отметить рану сам тегом [SCAR:…].': 'A big fall leaves a scar — the character remembers the grievance even after reconciliation. The AI can mark the wound itself with a [SCAR:…] tag.',
  'Задаёт вайб: ИИ генерит паттерны именно под этот тип (любовь ≠ одержимость). «Авто» — по типу, определённому в чате.': 'Sets the vibe: the AI generates patterns specifically for this type (love ≠ obsession). “Auto” — by the type detected in the chat.',
  'После крупного изменения персонаж несколько ходов «под впечатлением». На счёт не влияет — только на отыгрыш.': 'After a big change the character is “impressed” for a few turns. Doesn’t affect the score — only the role-play.',
  'Несколько положительных ответов подряд усиливают следующий прирост. В hardcore разово поднимают кап.': 'Several positive responses in a row boost the next gain. In hardcore they raise the cap once.',
  'Стена недоверия в начале. Применяется к чатам без данных Love Score. Текущий чат не трогает.': 'A wall of distrust at the start. Applies to chats without Love Score data. Doesn’t touch the current chat.',
  'Прирост обрезается, штрафы усилены, очки остывают при простое. Перекрывает SlowBurn.': 'Gains are capped, penalties amplified, points cool down when idle. Overrides SlowBurn.',
  'Каждые N сообщений ИИ полностью пересоздаёт правила изменений, диапазоны и события.': 'Every N messages the AI fully regenerates the change rules, ranges and events.',
  'Сохраняй и загружай наборы правил. Авто-снапшот делается перед каждой генерацией.': 'Save and load rule sets. An auto-snapshot is taken before every generation.',
  'Просмотр текущего состояния системы, активных инжектов и как они работают.': 'View the current system state, active injections and how they work.',
  'ИИ читает историю чата + карту персонажа и предлагает счёт отношений': 'The AI reads the chat history + character card and suggests a relationship score',
  'Нажми на карточку, чтобы включить режим и раскрыть его настройки.': 'Click the card to enable the mode and reveal its settings.',
  'Глубокие обиды, которые персонаж помнит даже после примирения.': 'Deep grievances the character remembers even after reconciliation.',
  'Описывай поведение для позитивных и негативных значений.': 'Describe behavior for positive and negative values.',
  'Выбери что генерировать, подключи API и нажми кнопку.': 'Choose what to generate, connect the API and press the button.',
  'Скрытые правила (не показывать боту таблицу очков)': 'Hidden rules (don’t show the bot the score table)',
  'Обоснование в логе (AI пишет причину к счёту)': 'Reason in the log (AI writes the cause of each change)',
  'При достижении порога персонаж инициирует событие.': 'When the threshold is reached, the character initiates an event.',
  'Выбери один или оба — ИИ получит всю инфу вместе.': 'Pick one or both — the AI gets all the info together.',
  'Нет записей — убедись что у персонажа есть лорбук': 'No entries — make sure the character has a lorebook',
  'Описание из лорбука — не дублировать в промпт': 'Description from the lorebook — don’t duplicate in the prompt',
  'Нет записей — подключи лорбук к персонажу': 'No entries — attach a lorebook to the character',
  'Двойной тап по сердечку открывает панель': 'A double-tap on the heart opens the panel',
  'Персонажи в чате — добавить в окружение?': 'Characters in the chat — add to surroundings?',
  'Данные обновляются при открытии вкладки': 'Data refreshes when the tab is opened',
  'Decay — очки остывают при простое': 'Decay — points cool down when idle',
  'Выбери записи для добавления': 'Select entries to add',
  'За что растут и падают очки.': 'What points rise and fall for.',
  'Выбери хотя бы один источник': 'Select at least one source',
  'Включить авто-регенерацию': 'Enable auto-regeneration',
  'Включить режим окружения': 'Enable surroundings mode',

  // ── Короткие лейблы / заголовки / кнопки ──
  'Сообщений из чата:': 'Chat messages:',
  'Нет сохранённых пресетов': 'No saved presets',
  'Макс. прирост за ответ:': 'Max gain per response:',
  'Поведение по диапазонам': 'Behavior by range',
  'Применить к этому чату': 'Apply to this chat',
  'Сгенерировать маршруты': 'Generate routes',
  'Нет NPC в текущем чате': 'No NPCs in the current chat',
  'Авто-регенерация': 'Auto-regeneration',
  '⚔ Соперник за внимание': '⚔ Rival for attention',
  'Романтические события': 'Romantic events',
  'Правила изменений': 'Change rules',
  'Диапазоны позитив': 'Positive ranges',
  'Диапазоны негатив (-100…-1)': 'Negative ranges (-100…-1)',
  'Предложить макс. очки': 'Suggest max points',
  'Сгенерировать события': 'Generate events',
  'Записи лорбука': 'Lorebook entries',
  'Текущий промпт-инжект': 'Current prompt injection',
  'Игровые модификаторы': 'Game modifiers',
  '-- нажми обновить --': '-- click refresh --',
  'Шрам при падении на': 'Scar on a fall of',
  '-- выбери модель --': '-- select a model --',
  'Рекомендуемый счёт:': 'Suggested score:',
  'Множитель штрафов:': 'Penalty multiplier:',
  'Внутренний монолог': 'Inner monologue',
  'Тип для генерации:': 'Type for generation:',
  'Простой (до decay)': 'Idle (until decay)',
  'Правила изменения': 'Change rules',
  'Анализировать чат': 'Analyze the chat',
  'Добавить диапазон': 'Add a range',
  'Текущее состояние': 'Current state',
  'Активный диапазон': 'Active range',
  'Событий в очереди': 'Events in queue',
  'Теги в ответах AI': 'Tags in AI replies',
  'Найти NPC в чате': 'Find NPCs in the chat',
  'Кулдаун прорыва:': 'Breakthrough cooldown:',
  'над точкой обиды': 'above the grievance point',
  'Что генерировать': 'What to generate',
  'Особые пожелания': 'Special preferences',
  'Режим применения': 'Application mode',
  'Добавить событие': 'Add an event',
  'Окружение пустое': 'Surroundings are empty',
  'Создать вручную': 'Create manually',
  'Стартовый счёт:': 'Starting score:',
  'Строгие правила': 'Strict rules',
  'Источник данных': 'Data source',
  '0 = без истории': '0 = no history',
  'Импорт из файла': 'Import from file',
  'Шрамов пока нет': 'No scars yet',
  'Заживает при +': 'Heals at +',
  'Динамика очков': 'Score dynamics',
  'Стрелка тренда': 'Trend arrow',
  'График истории': 'History chart',
  'Добавить ветку': 'Add a branch',
  'Холодный старт': 'Cold start',
  'любой маршрут': 'any route',
  'Применить тип': 'Apply type',
  '0 = навсегда': '0 = forever',
  'Вид и инжект': 'Display & injection',
  'Тон инжекта:': 'Injection tone:',
  'Сбросить все': 'Reset all',
  '× к минусам': '× to penalties',
  'Остывать на': 'Cool down by',
  'Анализ чата': 'Chat analysis',
  'Тон инжекта': 'Injection tone',
  'Текущий тип': 'Current type',
  'Из лорбука': 'From lorebook',
  'Пока пусто': 'Empty for now',
  'Авто-реген': 'Auto-regen',
  '− давление': '− pressure',
  'Сердечко:': 'Heart:',
  'Подсказки': 'Hints',
  'сообщений': 'messages',
  'Дополнить': 'Extend',
  'Диапазоны': 'Ranges',
  'Окружение': 'Surroundings',
  'и больше': 'and more',
  'Серия от': 'Streak from',
  'Сдвиг от': 'Shift from',
  'держится': 'lasts',
  'Включено': 'Enabled',
  'очистить': 'clear',
  'Размытое': 'Blurred',
  'Карточка': 'Card',
  'Заменить': 'Replace',
  'маршрут:': 'route:',
  'Сейчас:': 'Now:',
  'История': 'History',
  'Размер:': 'Size:',
  'Позиция': 'Position',
  'Заливка': 'Fill',
  'Правила': 'Rules',
  'События': 'Events',
  'Отладка': 'Debug',
  'счёт от': 'score from',
  'Импульс': 'Momentum',
  'каждые': 'every',
  'сообщ.': 'msgs',
  '+ Шрам': '+ Scar',
  'Каждые': 'Every',
  'Режимы': 'Modes',
  'Прорыв': 'Breakthrough',
  'ходов': 'turns',
  'Очки:': 'Points:',
  'Язык:': 'Language:',
  'Обзор': 'Overview',
  'зажил': 'healed',
  'Серия': 'Streak',
  'за +1': 'per +1',
  'шт.': 'pcs',
  'вкл': 'on',
  'до': 'to',
  'от': 'from',
  'сообщ': 'msgs',
  'макс': 'max',
  'сейчас': 'now',
  'без изменений': 'no change',
  'диапазонов': 'ranges',
  'событий': 'events',
  'правил': 'rules',
  'активно': 'active',
  'активен': 'active',

  // ── Атрибуты title / placeholder (полные значения) ──
  'Конкурент за внимание главного персонажа: его рост давит на твой счёт': 'A competitor for the main character’s attention: their growth presses on your score',
  'Верхний порог событий (поднимет максимум при необходимости)': 'Upper event threshold (will raise the max if needed)',
  'Сколько вычитается из твоего счёта за каждый +1 соперника': 'How much is subtracted from your score for each +1 of the rival',
  'Описание уже есть в лорбуке — повторный инжект не нужен': 'The description is already in the lorebook — no need to re-inject',
  'Сколько событий сгенерировать (0 = на усмотрение ИИ)': 'How many events to generate (0 = at the AI’s discretion)',
  'Например: не добавляй события про брак...': 'For example: don’t add marriage events...',
  'Тон, поведение и ставки этой ветки...': 'The tone, behavior and stakes of this branch...',
  'Имя для инжекта в промпт (англ.)': 'Name for the prompt injection (English)',
  'Описание / характер для промпта…': 'Description / personality for the prompt…',
  'Что должен сделать персонаж...': 'What the character should do...',
  'Регенерировать прямо сейчас': 'Regenerate right now',
  'Свернуть / развернуть шапку': 'Collapse / expand the header',
  'Нажми чтобы сменить аватар': 'Click to change the avatar',
  'Записать обиду вручную...': 'Record a grievance manually...',
  'Описание поведения...': 'Behavior description...',
  'Выбрать все в группе': 'Select all in the group',
  'Добавить в окружение': 'Add to surroundings',
  'Название пресета...': 'Preset name...',
  'Убрать из окружения': 'Remove from surroundings',
  'Снять все в группе': 'Deselect all in the group',
  'Название ветки...': 'Branch name...',
  'Загрузить модели': 'Load models',
  'Обновить список': 'Refresh the list',
  'Скопировать всё': 'Copy everything',
  'Вернуть в угол': 'Return to the corner',
  'Скопировать': 'Copy',
  'Свернуть': 'Collapse',
  'Имя...': 'Name...',

  // ── Блок «Язык ответов ИИ» (genLang — это язык ОТВЕТОВ модели, не язык UI) ──
  'Язык ответов ИИ': 'AI reply language',
  'Язык ответов ИИ. Если в таверне выбран русский — пиши на русском, иначе English.': 'Language of the AI’s replies. If Russian is selected in the tavern — write in Russian, otherwise English.',
  'Управляет тем, на каком языке ИИ присылает ответы. На язык интерфейса не влияет.': 'Controls which language the AI replies in. Does not affect the interface language.',

  // ── Прочие вкладки / разделы ──
  'Маршруты': 'Routes',
  'Макс. очки': 'Max points',

  // ── Подписи карточек модификаторов (ui.js modCard desc) ──
  '±2 макс за ответ — медленное сближение': '±2 max per response — a slow build-up',
  'Сложно набрать, штрафы усилены': 'Hard to earn, penalties amplified',
  'Новые чаты начинаются в минусе': 'New chats start in the minus',
  'Память о крупных обидах': 'Memory of major grievances',
  'Бонус за плюсы подряд': 'Bonus for consecutive gains',
  'Эхо после крупного сдвига': 'Echo after a big shift',

  // ── Значения панели «Текущее состояние» (ui.js debug) ──
  'без огр.': 'no cap',
  'готов': 'ready',
  'выкл': 'off',
  'строгий': 'strict',
  'подсказки': 'hints',
  'монолог': 'monologue',
  'скрыто': 'hidden',
  'старт': 'start',
  'акт.': 'act.',
  'ход.': 'turns',
  'Новый NPC': 'New NPC',

  // ── Теги в ответах AI (ui.js debug «Теги в ответах AI») ──
  'обновить счёт главного героя': 'update the main character’s score',
  'обновить счёт + причина в лог': 'update the score + reason in the log',
  'установить тип отношений': 'set the relationship type',
  'отметить романтическое событие выполненным': 'mark a romantic event as completed',
  'редкий большой прыжок (hardcore, обходит кап)': 'rare big jump (hardcore, bypasses the cap)',
  'отметить глубокую обиду (шрам)': 'mark a deep grievance (scar)',
  'NPC Окружение': 'NPC Surroundings',
  '(расширение отключено)': '(extension disabled)',
  'обновить счёт NPC (соперник: его рост давит на твой счёт)': 'update the NPC score (rival: their growth presses on your score)',
  'установить тип отношений NPC': 'set the NPC relationship type',
  'Доступные типы:': 'Available types:',
};

const has = k => Object.prototype.hasOwnProperty.call(DICT, k);
function exact(str) {
  const t = str.trim();               // trim снимает и обычные, и неразрывные пробелы
  if (has(t)) return str.replace(t, DICT[t]);
  // нормализуем неразрывные пробелы (&nbsp; → ' ') и схлопываем пробелы
  const norm = t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  if (norm !== t && has(norm)) return DICT[norm];
  return null;
}

// Перевод одиночной строки (для уведомлений/toast и любого текста).
export function tr(s) {
  if (s == null || !isEnglishUI()) return s;
  const str = String(s);
  if (!CYR.test(str)) return str;
  return exact(str) ?? str;
}

// Перевод поддерева DOM «на месте»: текстовые узлы + title/placeholder/aria-label.
export function translateTree(root) {
  if (!isEnglishUI() || !root || root.nodeType === undefined) return;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const texts = [];
    let n;
    while ((n = walker.nextNode())) texts.push(n);
    // также сам root, если это текстовый узел
    if (root.nodeType === 3) texts.push(root);
    for (const t of texts) {
      const orig = t.nodeValue;
      if (!orig || !CYR.test(orig)) continue;
      const nv = exact(orig);
      if (nv && nv !== orig) t.nodeValue = nv;
    }
    if (root.querySelectorAll) {
      const sel = '[title],[placeholder],[aria-label]';
      const list = [...root.querySelectorAll(sel)];
      if (root.matches?.(sel)) list.unshift(root);
      for (const el of list) {
        for (const a of ['title', 'placeholder', 'aria-label']) {
          const val = el.getAttribute?.(a);
          if (!val || !CYR.test(val)) continue;
          const nv = exact(val);
          if (nv && nv !== val) el.setAttribute(a, nv);
        }
      }
    }
  } catch { /* перевод не критичен */ }
}

// Навесить наблюдатель: переводить корень сейчас и при любых перерисовках
// (innerHTML заменяется в render*-функциях). Возвращает MutationObserver | null.
export function observeTree(root) {
  if (!isEnglishUI() || !root) return null;
  translateTree(root);
  try {
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) translateTree(node);
        if (m.type === 'attributes' && m.target) translateTree(m.target);
      }
    });
    obs.observe(root, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'],
    });
    return obs;
  } catch {
    return null;
  }
}
