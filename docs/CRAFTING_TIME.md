# Время производства: проверенная модель

Проверено 14.11.2026 по опубликованному серверному коду Clockwork Labs, коммит **`85c972d8d9433560fb51a906424b74b7958ddf99`**. Таблицы приложения взяты из отдельного снимка BitCraftToolBox **`af485cdbbb5cfaf9b6fd89742ecd7abac5009d3f`**, 13.11.2026. Проверка кода объясняет поля, но не подтверждает равенство снимка настройкам работающего сервера.

## Активный крафт

В [`craft.rs`, `event_delay`](https://github.com/clockworklabs/BitCraftPublic/blob/85c972d8d9433560fb51a906424b74b7958ddf99/BitCraftServer/packages/game/src/game/handlers/player_craft/craft.rs#L37-L44) задержка одного действия в секундах равна:

```text
delay = time_requirement / (CraftingSpeed + skill_speed − 1)
```

`actions_required` — требуемый **прогресс на одну операцию**, а не неизменное количество нажатий. В [`reduce_with_options`](https://github.com/clockworklabs/BitCraftPublic/blob/85c972d8d9433560fb51a906424b74b7958ddf99/BitCraftServer/packages/game/src/game/handlers/player_craft/craft.rs#L555-L612) прогресс удара зависит от мощности инструмента, мощности навыка, критического множителя и бонусного прогресса. Порог завершения — `actions_required × craft_count`.

При фиксированных значениях, без критов, помощников и бонусных ударов:

```text
progress_per_hit = round(tool_power + skill_power)
hits = ceil(actions_required × operations / progress_per_hit)
active_seconds = hits × delay
```

Проект пока не имеет характеристик конкретного персонажа. Поэтому допустимая **базовая оценка**, которую можно воспроизвести только по рецепту:

```text
base_seconds = time_requirement × actions_required × operations
```

У этой оценки явные допущения: скорость ×1, прогресс 1 за действие, без критов. Это условная единая модель для сравнения цепочек, а не прогноз времени игрока или обещание доступности рецепта с инструментом мощности 1. Мощность требуемого инструмента не является расходуемым материалом и не заменяет мощность выбранного инструмента.

## Пассивный крафт

Сервер выбирает пассивный обработчик при `is_passive && building_requirement.is_some()`. В [`passive_craft_queue.rs`](https://github.com/clockworklabs/BitCraftPublic/blob/85c972d8d9433560fb51a906424b74b7958ddf99/BitCraftServer/packages/game/src/game/handlers/player_craft/passive_craft_queue.rs#L119-L140) одна операция занимает `time_requirement` секунд. `actions_required` на это время не умножается. [`PassiveCraftState::process_oldest_queued`](https://github.com/clockworklabs/BitCraftPublic/blob/85c972d8d9433560fb51a906424b74b7958ddf99/BitCraftServer/packages/game/src/game/entities/passive_craft_state.rs#L14-L44) запускает следующую операцию после освобождения слота с той же длительностью.

Сумма `time_requirement × operations` означает последовательное выполнение. Реальная длительность может меняться из-за числа слотов, уже занятых слотов, очереди и доступных станций. Здесь эти параметры не моделируются.

## Конвертация предметов

В [`item_convert.rs`, `event_delay_recipe_id`](https://github.com/clockworklabs/BitCraftPublic/blob/85c972d8d9433560fb51a906424b74b7958ddf99/BitCraftServer/packages/game/src/game/handlers/player_craft/item_convert.rs#L16-L28) `time_cost` передаётся в `Duration::from_secs_f32` после умножения на количество операций. Значит, `time_cost` — секунды на одну операцию, а полное время выбранных конверсий — `time_cost × operations`.

## Сумма цепочки и ограничения

- Складываются только операции выбранных рецептов после учёта партий, запасов и повторного использования остатков.
- В сумму не входят сбор сырья, бой, дорога, восстановление выносливости, подготовка и переключение станций, ожидание очереди и параллельное производство.
- Время добычи нельзя получить из одного `time_requirement` без модели источника, здоровья ресурса, инструмента и количества результатов. Оно остаётся неизвестным.
- Отсутствующее или неподдерживаемое время остаётся `null`; его нельзя подменять нулём и выдавать частичную сумму за полную.
- Случайный результат не получает гарантированную длительность производства целевого количества. Базовый расчёт применим лишь к гарантированному выходу выбранного способа.
