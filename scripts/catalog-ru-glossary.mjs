// Companion terminology for ambiguous game words and repeated item families.
const terms = {
  ANY: 'Любой навык', Carpentry: 'Плотницкое дело', Carpenter: 'Плотник', Construction: 'Строительство',
  Builder: 'Строитель', Cooking: 'Кулинария', Cook: 'Повар', Farming: 'Земледелие', Farmer: 'Фермер',
  Fishing: 'Рыбалка', Fisher: 'Рыбак', Foraging: 'Собирательство', Forager: 'Собиратель',
  Forestry: 'Лесное дело', Forester: 'Лесник', Hunting: 'Охота', Hunter: 'Охотник',
  'Hexite Gathering': 'Добыча хексита', 'Hexite Gatherer': 'Добытчик хексита', Leatherworking: 'Кожевенное дело',
  Leatherworker: 'Кожевник', Masonry: 'Каменное дело', Mason: 'Каменщик', Mining: 'Горное дело', Miner: 'Шахтёр',
  Merchanting: 'Торговля', Merchant: 'Торговец', Sailing: 'Мореходство', Sailor: 'Моряк', Scholar: 'Учёный',
  Slayer: 'Истребитель', Smithing: 'Кузнечное дело', Smith: 'Кузнец', Tailoring: 'Портняжное дело', Tailor: 'Портной',
  Taming: 'Приручение', Tamer: 'Укротитель', Lumberjack: 'Лесоруб', Adventure: 'Приключение',
  Profession: 'Профессия', Common: 'Обычная', Uncommon: 'Необычная', Rare: 'Редкая', Epic: 'Эпическая',
  Legendary: 'Легендарная', Mythic: 'Мифическая', Any: 'Любая', Cargo: 'Груз', Item: 'Предмет',
  'Huntable Animal': 'Промысловое животное', Monster: 'Монстр',
  'Dungeon Loot': 'Добыча из подземелий', 'Dungeon Crafting Material': 'Материалы подземелий',
  'Sailing Loot': 'Морская добыча', 'Twitch Cosmetic': 'Внешний вид за просмотр Twitch',
  'Citric Berry': 'Цитрусовая ягода', 'Hex Coin Sack': 'Мешок хекситовых монет',
  Hexite: 'Хексит', 'Hex Coin': 'Хекситовая монета', 'Hex Coin Purse': 'Кошель с хекситовыми монетами',
  'Rangifer Antler': 'Рог рангифера', 'Preserved Mushroom': 'Сохранившийся гриб', 'Berserker Mushroom': 'Гриб берсерка',
  'Enormous Trask Scale': 'Огромная чешуя траска', 'Hardened Lobster Chitin': 'Прочный хитин',
  'Hexite Infused Lobster Chitin': 'Хитин с хекситом', Coralith: 'Коралит', 'Damaged Ancient Connector': 'Древний соединитель',
  'Rotten Log': 'Гнилое бревно', 'Rotten Stump': 'Гнилой пень', 'Basic Amber Resin': 'Базовая янтарная смола',
  'Maple Sapling': 'Саженец клёна', 'Flint Tool Bundle': 'Набор кремнёвых инструментов',
  'Flint Saw': 'Кремнёвая пила', 'Flint Axe': 'Кремнёвый топор', 'Flint Pickaxe': 'Кремнёвая кирка',
  'Flint Bow': 'Кремнёвый лук', 'Flint Knife': 'Кремнёвый нож', 'Flint Hammer': 'Кремнёвый молот',
  'Fine Lobster': 'Качественный лобстер', 'Peerless Lobster': 'Непревзойдённый лобстер',
  'Flawless Lobster': 'Безупречный лобстер', 'Enormous Trask': 'Огромный траск',
  'Fishing Station': 'Рыболовная станция', 'Masonry Station': 'Станция каменщика',
  'Carpentry Station': 'Столярная станция', 'Smithing Station': 'Кузнечная станция', 'Forge': 'Кузница',
  'Tailoring Station': 'Портняжная станция', 'Leatherworking Station': 'Кожевенная станция',
  'Foraging Station': 'Станция собирателя', 'Cooking Station': 'Кухонная станция',
  'Farming Station': 'Фермерская станция', 'Hunting Station': 'Охотничья станция',
  'Trading Post': 'Торговый пост', 'Storage': 'Хранилище', 'Tool Scrap': 'Лом инструмента',
  Loom: 'Ткацкий станок', 'Rough Loom': 'Грубый ткацкий станок', 'Simple Loom': 'Простой ткацкий станок',
  'Cooling Energy': 'Охлаждающая энергия', 'Warming Energy': 'Согревающая энергия',
  'Cooling Capacitor': 'Охлаждающий конденсатор', "Blacksmith's Key": 'Ключ кузнеца',
  'Crushed Piece of Argent Ore': 'Кусок дроблёной руды аргента',
  'Ripped Notes': 'Оторванные записки', 'Shredded Notes': 'Изорванные записки',
  'Reforging Solvent': 'Растворитель для перековки', 'Ornate Reforging Solvent': 'Изысканный растворитель для перековки',
  'Survey the Lake': 'Разведать озеро', 'World Explorer I': 'Исследователь мира I', 'World Explorer II': 'Исследователь мира II',
  "Hunter's First Steps": 'Первые шаги охотника', "Carpenter's First Steps": 'Первые шаги плотника',
  'Lost Shipment': 'Пропавший груз', 'Lost Treasure': 'Затерянное сокровище', 'Lost Wreckage': 'Затерянные обломки',
  'Fishing Basics': 'Основы рыбалки', 'The Landweaver': 'Ткач земель',
  'Practice Dummy': 'Тренировочное чучело', 'Sagi Bird': 'Птица саги', Dromai: 'Дромай', Ardea: 'Ардея',
  'Nubi Goat': 'Коза нуби', Yagi: 'Яги', 'Female Cervus': 'Самка цервуса', 'Male Cervus': 'Самец цервуса',
  Rangifer: 'Рангифер', 'Female Scrofa': 'Самка скрофы', 'Male Scrofa': 'Самец скрофы', 'Elder Scrofa': 'Старая скрофа',
  Ox: 'Вол', 'Tundra Ox': 'Тундровый вол', 'Jungle Terrorbird': 'Грозная птица джунглей',
  'Desert Terrorbird': 'Грозная птица пустыни', Jakyl: 'Джакил', 'Alpha Jakyl': 'Джакил-вожак', 'King Jakyl': 'Король джакилов',
  Skitch: 'Скитч', 'Desert Crab': 'Пустынный краб', 'Frost Crab': 'Морозный краб', Terratoad: 'Терражаба',
  'Swamp Terratoad': 'Болотная терражаба', Umbura: 'Умбура', 'Alpha Umbura': 'Умбура-вожак',
  'King Umbura': 'Король умбур', Drone: 'Трутень', Soldier: 'Солдат', Queen: 'Королева',
  'Feral Sentinel': 'Одичавший страж', 'Subterranean Jakyl': 'Подземный джакил',
  'Subterranean Skitch': 'Подземный скитч', 'Subterranean Jakyl Protector': 'Подземный джакил-защитник',
  'Giant Skitch': 'Гигантский скитч', 'Cave Skitch': 'Пещерный скитч', 'Massive Araknir': 'Огромный аракнир',
  'Unlit Torch': 'Незажжённый факел', 'Lost Facility Door': 'Дверь затерянного сооружения',
  'Immortal Guardian Spawner': 'Точка появления стража Бессмертных',
  'Small Araknir': 'Малый аракнир', 'Araknir Nest': 'Гнездо аракниров', 'Enraged Alpha Jakyl': 'Разъярённый джакил-вожак',
  'Swift Cervus': 'Быстрый цервус', 'Giant Hexite Skitch': 'Гигантский хекситовый скитч',
  'Starseeker Guardian': 'Страж Искателей звёзд', 'Starseeker Scout': 'Разведчик Искателей звёзд',
  'Starseeker Captain': 'Капитан Искателей звёзд', 'Starseeker Skirmisher': 'Застрельщик Искателей звёзд',
  'Immortal Guardian': 'Страж Бессмертных', 'Immortal Watcher': 'Дозорный Бессмертных',
  'Starseeker Armory': 'Арсенал Искателей звёзд', 'Abandoned Immortal Outpost': 'Заброшенный аванпост Бессмертных',
  'Araknir Den': 'Логово аракниров', 'Giant Skitch Dungeon': 'Подземелье гигантского скитча',
  'Cracked Pot': 'Треснувший горшок', 'Ancient Pot': 'Древний горшок', 'Ancient Pots': 'Древние горшки',
  'Ancient Chest': 'Древний сундук', 'Ornate Ancient Chest': 'Украшенный древний сундук',
  'Exquisite Ancient Chest': 'Изысканный древний сундук', 'Ancient Lockbox': 'Древний ларец',
  'Gold Studded Chest': 'Сундук с золотыми заклёпками', 'Diamond Encrusted Chest': 'Сундук, инкрустированный алмазами',
  "Adventurer's Belongings": 'Вещи искателя приключений', "Adventurer's Notes": 'Записки искателя приключений',
  "Ancient Trapsmith's Journal": 'Дневник древнего мастера ловушек',
  "Ancient Trapsmith's Journal #2": 'Дневник древнего мастера ловушек № 2',
  "Baffled Adventurer's Notes": 'Записки озадаченного искателя приключений',
  'Abandoned Chest': 'Брошенный сундук', 'Spoils of Exploration': 'Трофеи разведки',
  "First Settler's Chest": 'Сундук первого поселенца', "Desert Dweller's Belongings": 'Вещи жителя пустыни',
  'Ornate Desert Chest': 'Украшенный пустынный сундук',
  Heimlich: 'Хаймлих', Rumbagh: 'Румбах', Svim: 'Свим', Twins: 'Близнецы', Brico: 'Брико', Alesi: 'Алези',
  'Savory Raw Berry Pie': 'Непечёный пряный ягодный пирог', 'Novice Study Journal': 'Учебный журнал новичка',
  'Greenhorn Dolo Filet': 'Филе доло для новичков', 'Greenhorn Oceanfish Filet': 'Филе океанической рыбы для новичков',
  'Grand Fine Ruby': 'Крупный качественный рубин', 'Grand Peerless Ruby': 'Крупный непревзойдённый рубин',
  'Azure Minni': 'Лазурная минни', 'Azure Sphyra': 'Лазурная сфира', 'Azure Centro': 'Лазурный центро',
  'Azure Sphyra Filet': 'Филе лазурной сфиры', 'Azure Oceanfish Filet': 'Филе лазурной океанической рыбы',
  'Dapper Soiree Suit Hat': 'Шляпа из элегантного вечернего костюма',
  'Deed: Pet Croaklin (Light Pink)': 'Свидетельство на питомца кроклина (светло-розовый)',
  'Auric Bowl': 'Золотая чаша', 'Blue Striped Tube': 'Синий полосатый плавательный круг',
  'Heimlich Business Voucher': 'Торговый ваучер Хаймлиха', 'Sap Tap': 'Кран для древесного сока',
  'Araknir Corner Web': 'Паутина аракнира в углу', 'Araknir Web Pile': 'Куча паутины аракнира',
  'Ornate Tool Scrap': 'Изысканный лом инструмента', 'Pristine Metal Research': 'Безупречное исследование металлов',
  'Ornate Metal Research': 'Изысканное исследование металлов', 'Logcraft Cargo Bin': 'Деревянный ящик для грузов',
  'Crude Edge Beveler': 'Грубый фаскорез', 'Pristine Leather Research': 'Безупречное исследование кожи',
  'Calcic Edge Beveler': 'Кальциевый фаскорез', 'Uncharted Doubloon': 'Дублон неизведанных земель',
  'Rainbow Tube': 'Радужный плавательный круг', 'Uncharted Silkmoth Breeding Pair': 'Пара шелкопрядов из неизведанных земель',
  'Wicker Desk': 'Плетёный письменный стол', 'Berserker Crafting Potion': 'Зелье ремесла берсерка',
  'Cartwheel Fruit': 'Плод колёсного дерева', 'Advanced Skiff Material Pack': 'Набор материалов для улучшенной лодки',
  'Advanced Stone Carving Package': 'Упаковка улучшенной резьбы по камню', 'Uncharted Study Kit': 'Учебный набор неизведанных земель',
  'Ornate Brick Package': 'Упаковка изысканных кирпичей', 'Ornate Fiber Package': 'Упаковка изысканного волокна',
  'Ornate Rope Package': 'Упаковка изысканной верёвки', 'Ornate Embergrain Package': 'Упаковка изысканного жарозерна',
  'Ornate Glass Vial Package': 'Упаковка изысканных стеклянных флаконов',
  "Heimlich's Workbench": 'Верстак Хаймлиха', 'Crude Workbench': 'Грубый верстак',
  'Ornate Large Wall Connector': 'Украшенный соединитель больших стен',
  'Pink Streamer Archway': 'Арка с розовыми лентами', 'Green Streamer Archway': 'Арка с зелёными лентами',
  'Blue Streamer Archway': 'Арка с синими лентами', 'Red Streamer Archway': 'Арка с красными лентами',
  'Black Streamer Archway': 'Арка с чёрными лентами', 'Dungeon Brazier 3': 'Жаровня подземелья 3',
  'Fihs Display': 'Витрина с рыбой', 'Honeyberry Bush': 'Куст медовой ягоды', 'Cloudberry Bush': 'Куст морошки',
  'The Stonesmith': 'Каменных дел мастер', 'Masonry Show Off': 'Демонстрация каменного дела',
  'Carpenter Show Off': 'Демонстрация плотницкого дела', 'Farmer Show Off': 'Демонстрация земледелия',
  'Emote Show Off Hoe': 'Эмоция «Показать мотыгу»', 'Creepy Crawlies': 'Ползучие твари',
  'SpeakToBrico': 'Поговорить с Брико', 'HoneyTurnIn': 'Сдать мёд', 'GetBricosBigKeys': 'Получить большие ключи Брико',
  'TurnInToBrico': 'Сдать задание Брико', 'BricoTurnInDialogue': 'Поговорить с Брико при сдаче задания',
  'CraftCookedBerries': 'Приготовить ягоды', 'GoToBank': 'Подойти к банку',
  'AlphaJakylFirstQuestSpeakToAlesi': 'Поговорить с Алези о джакиле-вожаке',
  'WispTellsUsToUseCompendium': 'Огонёк предлагает открыть справочник', 'WispPopupWaystones': 'Подсказка огонька о путевых камнях',
  'GoToWaystone': 'Подойти к путевому камню', 'WispFirstDialogue': 'Первый разговор с огоньком',
  'Collect Depleted Hexite Battery - Personal Cache (II) Upgrade': 'Собрать разряженную хекситовую батарею для улучшения личного тайника II',
  'Bring Brico Planks and Nails - Level 40 Construction Experience Quest': 'Принести Брико доски и гвозди · опыт строительства, уровень 40',
  'Acquire Nubi Berry Mash - Nubi Goat III': 'Получить ягодную мешанку для козы нуби III',
  'Craft Proficient Study Journal': 'Изготовить учебный журнал знатока',
  'Craft Comprehensive Study Journal': 'Изготовить полный учебный журнал',
  'Craft Celestium Plated Bracers': 'Изготовить латные наручи из целестиума',
  'Craft Fine Leather Leggings': 'Изготовить поножи из качественной кожи',
  'Craft Fine Leather Cap': 'Изготовить шапку из качественной кожи',
  'Bake Plain Berry Pie': 'Испечь простой ягодный пирог',
  'Reforge Fine Sapphire': 'Перековать качественный сапфир',
  'Reforge Peerless Emerald': 'Перековать непревзойдённый изумруд',
  'Refine Refined Celestium Ingot': 'Очистить слиток целестиума', PuzzleRuinsA: 'Загадочные руины A',
  SmallPyreliteCaveInterior: 'Малая пирелитовая пещера', TowerRuinPillarMedium1: 'Средняя колонна руин башни 1',
  TowerRuinPillarLarge2: 'Большая колонна руин башни 2', TowerRuinPillarSmall1: 'Малая колонна руин башни 1',
  TowerRuinPillarLarge3: 'Большая колонна руин башни 3'
};

const metals = {
  Ferralith: ['Ферралит', 'ферралита'], Pyrelite: ['Пирелит', 'пирелита'], Emarium: ['Эмариум', 'эмариума'],
  Elenvar: ['Эленвар', 'эленвара'], Luminite: ['Люминит', 'люминита'], Rathium: ['Ратий', 'ратия'],
  Umbracite: ['Умбрацит', 'умбрацита'], Aurumite: ['Аурумит', 'аурумита'],
  Celestium: ['Целестиум', 'целестиума'], Astralite: ['Астралит', 'астралита'],
  Argent: ['Аргент', 'аргента'], Auric: ['Аурик', 'аурика'], Calcic: ['Кальцик', 'кальцика']
};
const metalItems = {
  Ingot: 'Слиток', 'Ingot Package': 'Упаковка слитков', Ore: 'Руда', 'Ore Piece': 'Кусок руды',
  'Ore Concentrate': 'Концентрат руды', 'Ore Chunk': 'Глыба руды', 'Ore Package': 'Упаковка руды',
  Nugget: 'Самородок', Nails: 'Гвозди', Frames: 'Каркасы', Pickaxe: 'Кирка', Axe: 'Топор',
  Blade: 'Клинок', Bow: 'Лук', Crossbow: 'Арбалет', Saw: 'Пила', Knife: 'Нож', Mace: 'Булава',
  Hammer: 'Молот', Chisel: 'Долото', Hoe: 'Мотыга', Quill: 'Перо', Rod: 'Удочка', Scissors: 'Ножницы',
  Claymore: 'Клеймор', Shortsword: 'Короткий меч', Longsword: 'Длинный меч', Dagger: 'Кинжал',
  'Plated Armor': 'Латный доспех', 'Plated Belt': 'Латный пояс', 'Plated Bracers': 'Латные наручи',
  'Shield': 'Щит', 'Duelist Armor': 'Доспех дуэлянта'
};
const tiers = {
  Rough: 'грубый', Basic: 'базовый', Simple: 'простой', Sturdy: 'прочный', Fine: 'качественный',
  Exquisite: 'изысканный', Peerless: 'непревзойдённый', Ornate: 'украшенный', Pristine: 'первозданный',
  Magnificent: 'великолепный', Flawless: 'безупречный', Crude: 'грубый'
};
const tieredItems = {
  'Wood Log': ['бревно', 'ое'], 'Tree Bark': ['кора', 'ая'], 'Wood Plank': ['доска', 'ая'], Plank: ['доска', 'ая'],
  'Planks': ['доски', 'ые'], 'Pebbles': ['камешки', 'ые'], 'Stone': ['камень', 'ый'],
  'Stone Chunk': ['обломок камня', 'ый'], 'Brick': ['кирпич', 'ый'], 'Clay': ['глина', 'ая'],
  'Glass Vial': ['стеклянный флакон', 'ый'], 'Fiber': ['волокно', 'ое'], 'Rope': ['верёвка', 'ая'],
  'Leather': ['кожа', 'ая'], 'Mushroom': ['гриб', 'ый'], 'Geode': ['жеода', 'ая'],
  'Pelt': ['шкура', 'ая'], 'Raw Pelt': ['необработанная шкура', 'ая'],
  'Lobster': ['лобстер', 'ый'], 'Tannin': ['танин', 'ый'], 'Amber Resin': ['янтарная смола', 'ая']
};
const actions = {
  Gather: 'Собрать', Chop: 'Срубить', Mine: 'Добыть', Dig: 'Копать', 'Dig Up': 'Выкопать',
  Chip: 'Отколоть', Open: 'Открыть', Pickup: 'Подобрать', Cut: 'Срезать', Read: 'Прочитать',
  Take: 'Взять', Power: 'Подать питание', Repair: 'Починить', Destroy: 'Разрушить', Catch: 'Поймать',
  Fish: 'Ловить рыбу', Chum: 'Прикормить', 'Net Fish': 'Ловить сетью', Bait: 'Наживить', Collect: 'Собрать',
  Loot: 'Забрать добычу', Rescue: 'Спасти', Tame: 'Приручить', Unlock: 'Открыть доступ',
  Salvage: 'Разобрать', Agitate: 'Встряхнуть', Replant: 'Пересадить', Challenge: 'Бросить вызов',
  Extract: 'Извлечь', Absorb: 'Поглотить', 'Offer Sugar': 'Предложить сахар', Transcribe: 'Переписать',
  Reforge: 'Перековать', Store: 'Сложить', Sew: 'Сшить', Harvest: 'Собрать урожай', 'Put Out': 'Потушить',
  Extinguish: 'Погасить', 'Use Sawmill': 'Использовать лесопилку', 'Collect Fruit': 'Собрать плоды',
  Deposit: 'Внести', Chisel: 'Высечь', Stock: 'Пополнить', Clear: 'Расчистить', Identify: 'Опознать',
  Process: 'Обработать', Craft: 'Изготовить', 'Loot from': 'Добыча с', Deplete: 'Истощить', Grow: 'Вырастить'
};
const ranks = { Novice: 'Новичок', Apprentice: 'Ученик', Journeyman: 'Подмастерье', Adept: 'Опытный',
  Professional: 'Профессионал', Expert: 'Эксперт', Master: 'Мастер', Grandmaster: 'Грандмастер' };
const recipeActions = {
  Forge: 'Выковать', Craft: 'Изготовить', Recraft: 'Перековать', Extract: 'Извлечь', Unpack: 'Распаковать',
  Smelt: 'Выплавить', 'Research Schematic:': 'Изучить чертёж', 'Schematic:': 'Чертёж'
};
const firstUpper = text => text[0].toUpperCase() + text.slice(1);

export function russianCatalogText(text, draft) {
  if (Object.hasOwn(terms, text)) return terms[text];
  if (Object.hasOwn(metals, text)) return metals[text][0];
  for (const [metal, [, genitive]] of Object.entries(metals)) {
    if (text.startsWith(metal + ' ') && metalItems[text.slice(metal.length + 1)]) return metalItems[text.slice(metal.length + 1)] + ' ' + genitive;
    if (text === `Refined ${metal} Ingot`) return 'Очищенный слиток ' + genitive;
    if (text === `Refined ${metal} Ingot Package`) return 'Упаковка очищенных слитков ' + genitive;
    if (text === `Crushed ${metal} Ore`) return 'Дроблёная руда ' + genitive;
  }
  const [prefix, ...tail] = text.split(' ');
  const rest = tail.join(' ');
  if (tiers[prefix] && tieredItems[rest]) {
    const [noun, ending] = tieredItems[rest];
    const adjective = ending === 'ый' ? tiers[prefix] : tiers[prefix].slice(0, -2) + ending;
    return firstUpper(adjective) + ' ' + noun;
  }
  if (prefix === 'Adept' && terms[rest]) return 'Опытный ' + terms[rest].toLowerCase();
  if (ranks[prefix] && terms[rest]) return terms[rest] + ' · ' + ranks[prefix].toLowerCase();
  const explorer = /^World Explorer ([IVX]+)$/.exec(text);
  if (explorer) return 'Исследователь мира ' + explorer[1];
  const sailorTasks = /^Sailor Tasks Tier (\d+)$/.exec(text);
  if (sailorTasks) return 'Задания моряка · T' + sailorTasks[1];
  const dialogue = /^([A-Za-z]+) ?(First|Second|Third|Final) ?Dialogue - Level (\d+) (.+) Exp Quest$/.exec(text);
  const dialogueSteps = { First: 'Первый', Second: 'Второй', Third: 'Третий', Final: 'Последний' };
  if (dialogue && terms[dialogue[4]]) {
    const [, npc, step, level, skill] = dialogue;
    return `${dialogueSteps[step]} разговор · ${terms[npc] || npc} · опыт и уровень ${level} (${terms[skill]})`;
  }
  const cacheUpgrade = /^Rumbagh (First|Second|Third|Final) Dialogue - Personal Cache \(II\) Upgrade$/.exec(text);
  if (cacheUpgrade) return `${dialogueSteps[cacheUpgrade[1]]} разговор с Румбахом · улучшение личного тайника II`;
  const [verb, target] = text.split(' · ');
  if (target && actions[verb]) {
    const subject = russianCatalogText(target, draft);
    if (subject) return actions[verb] + ' · ' + subject;
  }
  const recipe = /^(Forge|Craft|Recraft|Extract|Unpack|Smelt|Research Schematic:|Schematic:) (.+)$/.exec(text);
  if (recipe) {
    const subject = russianCatalogText(recipe[2], draft);
    if (subject && /\p{Script=Cyrillic}/u.test(subject)) return recipeActions[recipe[1]] + ' · ' + subject;
  }
  if (/^Terraform · height difference -?\d+$/.test(text)) return text.replace('Terraform · height difference', 'Терраформирование · перепад высоты');
  if (text.endsWith(' T2') && terms[text.slice(0, -3)]) return terms[text.slice(0, -3)] + ' T2';
  const lobster = /^Butcher Tier (\d+) Lobster$/.exec(text);
  if (lobster) return `Разделать лобстера T${lobster[1]}`;
  const resolver = /^Resolve Item (\d+)$/.exec(text);
  if (resolver) return `Раскрытие списка предмета № ${resolver[1]}`;
  const skillLevel = /^([A-Za-z]+)Level(\d+)Stats$/.exec(text);
  if (skillLevel && terms[skillLevel[1]]) return `${terms[skillLevel[1]]} · характеристики уровня ${skillLevel[2]}`;
  const tierKnowledge = /^Tier (\d+) (.+)$/.exec(text);
  if (tierKnowledge && (terms[tierKnowledge[2]] || metals[tierKnowledge[2]])) {
    return `${terms[tierKnowledge[2]] || metals[tierKnowledge[2]][0]} · T${tierKnowledge[1]}`;
  }
  const result = draft[text];
  return text.includes('(') ? result : result?.replace(/ \([A-Za-z][^()]*(?:\)|$)$/u, '');
}
