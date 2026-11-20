from pathlib import Path
import math
import textwrap
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/BitCraft_Companion_5_Redesign_Concepts_RU.pdf'
ASSETS=ROOT/'tmp/pdfs/concepts'
FONT=Path('C:/Windows/Fonts')
for name,file in [('UI','segoeui.ttf'),('Medium','segoeuisl.ttf'),('Bold','segoeuib.ttf'),('Display','georgia.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(FONT/file)))

W,H=1440,900
INK='#263D35'; MUTED='#78867B'; PAPER='#F7F5EF'; LINE='#DFE4DC'
concepts=[
 {'id':'01','file':'01-forest','title':'Лесная мастерская','tag':'Тёплый интерфейс для подготовки к большому приключению.','character':'Природный уют с выразительными деталями.','palette':['#F5F0E5','#214C3B','#B99057','#CAD8BA'],'changes':['Крупная иллюстрация предмета задаёт композицию и создаёт ощущение трофея.','Параметры собраны в одну полосу; главный результат виден сразу.','Хвойный цвет, латунь и мягкая глубина объединяют все вкладки.'],'strength':'Лучше всего поддерживает casual-настроение BitCraft и остаётся удобным калькулятором.','trade':'Понадобится единый набор качественных иллюстраций предметов.','mood':'Тёплая, природная','density':'Средняя','best':'Уютный универсальный помощник на каждый день.','accent':'#214C3B'},
 {'id':'02','file':'02-moon','title':'Лунная обсерватория','tag':'Тихий ночной интерфейс для долгих игровых вечеров.','character':'Матовые тёмные поверхности и мягкий свет.','palette':['#151F2A','#213744','#78B7A3','#DFB86F'],'changes':['Вероятность показана крупным кольцом, рядом - два главных ориентира.','Настройки стоят в отдельной боковой панели; график получает больше места.','Бирюза и янтарь подчёркивают данные, тонкие созвездия добавляют атмосферу.'],'strength':'Выразительный вариант для вечерней игры и второго монитора.','trade':'Таблицам и вторичным подписям потребуется особенно точная настройка контраста.','mood':'Ночная, спокойная','density':'Средняя','best':'Приложение рядом с игрой вечером или в тёмной комнате.','accent':'#213744'},
 {'id':'03','file':'03-atlas','title':'Атлас странника','tag':'Расчёты как страницы личного дневника исследователя.','character':'Бумага, чернила и картографическая графика.','palette':['#F4E9D4','#253E36','#A8663C','#D0BA91'],'changes':['Заголовки с засечками и тонкие линии задают характер полевого справочника.','Расчёт делится на образец предмета, результат и маршрут подготовки.','Топографика, медные акценты и рисунки выглядят как части одного атласа.'],'strength':'Самый самостоятельный образ и сильная связь с исследованием мира.','trade':'Декор нужно дозировать, чтобы большие таблицы оставались лёгкими для чтения.','mood':'Исследовательская','density':'Средняя','best':'Полевой дневник, коллекции находок и личные маршруты.','accent':'#A8663C'},
 {'id':'04','file':'04-soft','title':'Мягкий мир','tag':'Мягкие формы и удовольствие от маленьких целей.','character':'Тактильные пастели и предметы как миниатюры.','palette':['#F6F2EB','#B8AFE2','#A3C3AE','#EDCC81'],'changes':['Объёмный трофей и мягкие поверхности дают ощущение небольшого игрового мира.','Широкие вкладки-капсулы и крупные поля делают управление дружелюбнее.','Лавандовый результат и цветные жетоны времени формируют ясные акценты.'],'strength':'Самый игровой и дружелюбный стиль, близкий к casual-эстетике.','trade':'Большие элементы занимают больше места; подробным таблицам нужен отдельный режим.','mood':'Игровая, тактильная','density':'Ниже средней','best':'Простой ежедневный сценарий с крупными и понятными элементами.','accent':'#8275A8'},
 {'id':'05','file':'05-guild','title':'Гильдия мастеров','tag':'Рабочий стол для тех, кто любит точный план.','character':'Чистая типографика и продуманная плотность данных.','palette':['#EEEFEA','#FFFFFF','#315F50','#C49C62'],'changes':['Цель, параметры, результат и сохранение видны в одном рабочем пространстве.','Графики и таблицы становятся главным визуальным материалом.','Компактные вкладки и спокойные поверхности подходят для длинных цепочек крафта.'],'strength':'Самый практичный выбор для частых расчётов, запасов и сложных рецептов.','trade':'Меньше сказочности; настроение держится на предметных иконках и небольших деталях.','mood':'Собранная, деловая','density':'Выше средней','best':'Много рецептов, ресурсов и повторяющихся вычислений.','accent':'#315F50'}
]

c=canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1)
c.setTitle('BitCraft Companion - 5 вариантов редизайна')
c.setAuthor('BitCraft Companion / Design exploration')
c.setSubject('Пять визуальных концепций интерфейса для выбора направления')

def rect(x,y,w,h,color,r=0,stroke=None):
    c.setFillColor(HexColor(color))
    if stroke:c.setStrokeColor(HexColor(stroke));c.setLineWidth(.8)
    else:c.setStrokeColor(HexColor(color))
    if r:c.roundRect(x,H-y-h,w,h,r,stroke=bool(stroke),fill=1)
    else:c.rect(x,H-y-h,w,h,stroke=bool(stroke),fill=1)

def line(x1,y1,x2,y2,color=LINE,width=.8):
    c.setStrokeColor(HexColor(color));c.setLineWidth(width);c.line(x1,H-y1,x2,H-y2)

def text(x,y,s,size=16,font='UI',color=INK):
    c.setFillColor(HexColor(color));c.setFont(font,size);c.drawString(x,H-y-size*.80,s)

def wrap(s,width,size=16,font='UI'):
    words=s.split();lines=[];current=''
    for word in words:
        candidate=(current+' '+word).strip()
        if current and pdfmetrics.stringWidth(candidate,font,size)>width:lines.append(current);current=word
        else:current=candidate
    if current:lines.append(current)
    return lines

def para(x,y,s,width,size=16,leading=None,font='UI',color=INK):
    leading=leading or size*1.42
    for row in wrap(s,width,size,font):text(x,y,row,size,font,color);y+=leading
    return y

def footer(n,left='BITCRAFT COMPANION / ВИЗУАЛЬНЫЕ НАПРАВЛЕНИЯ'):
    line(60,861,W-60,861)
    text(60,875,left,10,color=MUTED)
    text(W-108,874,f'{n:02d} / 07',11,'Bold',MUTED)

def image(file,x,y,w,h):
    c.drawImage(ImageReader(str(ASSETS/(file+'.png'))),x,H-y-h,width=w,height=h,mask='auto')

def newpage(bg=PAPER):rect(0,0,W,H,bg)

newpage()
text(60,47,'BITCRAFT COMPANION',14,'Bold')
text(1020,49,'ДИЗАЙН-ИССЛЕДОВАНИЕ / 14.11.2026',12,color=MUTED)
line(60,83,1380,83)
text(60,121,'Пять характеров.',69,'Display')
text(60,207,'Один помощник.',69,'Display')
para(924,137,'Сохраняем понятные расчёты и придаём приложению характер мира BitCraft.',421,21,31)
para(924,257,'Крупнее типографика. Выразительнее предметы. Яснее акценты и состояния.',405,17,26,color=MUTED)
text(60,350,'ПЯТЬ РАЗНЫХ НАПРАВЛЕНИЙ',11,'Bold',MUTED)
for i,d in enumerate(concepts):
    x=60+i*269
    rect(x,389,247,149,'#E3E7DE',10)
    image(d['file'],x,389,247,149)
    text(x,559,d['id'],12,'Bold',d['accent'])
    para(x,585,d['title'],245,23,29,'Bold')
    para(x,658,d['mood'],245,14,21,color=MUTED)
line(60,723,1380,723)
para(60,747,'Один сценарий для честного сравнения: рог рангифера, шанс 2%, цель 1 предмет, 100 попыток. Вероятность результата - 86,74%.',800,17,25)
para(1018,747,'Внутри: крупные макеты, палитры, отличия, преимущества и компромиссы.',350,16,24,color=MUTED)
footer(1,'КОНЦЕПТУАЛЬНЫЕ МАКЕТЫ / ПРИЛОЖЕНИЕ ПОКА НЕ ИЗМЕНЕНО')
c.showPage()

for i,d in enumerate(concepts):
    newpage()
    text(60,43,f'{d["id"]} / НАПРАВЛЕНИЕ РЕДИЗАЙНА',11,'Bold',d['accent'])
    text(60,79,d['title'],44,'Bold')
    text(60,142,d['tag'],19,color=MUTED)
    if i==0:
        rect(1203,80,177,33,'#214C3B',16);text(1221,89,'РЕКОМЕНДУЮ',11,'Bold','#F7F5EF')
    rect(57,197,1060,646,'#E5E7DF',14)
    image(d['file'],62,202,1050,633.09)
    x=1150;y=204;width=230
    text(x,y,'ХАРАКТЕР',10,'Bold',MUTED);y+=26
    y=para(x,y,d['character'],width,18,25,'Bold')+23
    text(x,y,'ЧТО МЕНЯЕТСЯ',10,'Bold',MUTED);y+=24
    for n,s in enumerate(d['changes'],1):
        text(x,y,str(n).zfill(2),10,'Bold',d['accent'])
        y=para(x+25,y-1,s,width-25,13,18)+12
    y+=4
    text(x,y,'ПАЛИТРА',10,'Bold',MUTED);y+=22
    for j,color in enumerate(d['palette']):
        sw=49
        rect(x+j*59,y,sw,25,color,5,stroke='#D5DBD0' if color=='#FFFFFF' else None)
        text(x+j*59,y+33,color[1:],8,'UI',MUTED)
    y+=68
    text(x,y,'СИЛЬНАЯ СТОРОНА',10,'Bold',MUTED);y+=23
    y=para(x,y,d['strength'],width,13,19)+18
    text(x,y,'КОМПРОМИСС',10,'Bold',MUTED);y+=23
    y=para(x,y,d['trade'],width,13,19)
    if y>840:raise RuntimeError(f'Notes overflow in concept {d["id"]}: {y}')
    footer(i+2)
    c.showPage()

newpage()
text(60,43,'СРАВНЕНИЕ / ВЫБОР НАПРАВЛЕНИЯ',11,'Bold',MUTED)
text(60,80,'Какой характер ближе тебе?',43,'Bold')
para(60,143,'Все пять вариантов сохраняют разделы добычи, редкости, ресурсов, времени и личных планов. Ниже - моя оценка характера и плотности интерфейса.',1180,18,27,color=MUTED)
cols=[60,395,620,835,1380]
rect(60,233,1320,46,'#E9EDE4',7)
for x,label in zip(cols,['НАПРАВЛЕНИЕ','АТМОСФЕРА','ПЛОТНОСТЬ ДАННЫХ','ВЫБИРАЙ, ЕСЛИ НУЖЕН']):text(x+17,250,label,10,'Bold',MUTED)
for i,d in enumerate(concepts):
    y=280+i*65
    line(60,y+64,1380,y+64)
    rect(77,y+18,25,25,d['accent'],7)
    text(83,y+25,d['id'],10,'Bold','#FFFFFF')
    text(117,y+21,d['title'],18,'Bold')
    text(412,y+24,d['mood'],15)
    text(637,y+24,d['density'],15)
    para(852,y+15,d['best'],510,15,21)
rect(60,647,1320,159,'#214C3B',17)
text(85,672,'МОЙ ВЫБОР: №1',10,'Bold','#C6D2B7')
text(85,700,'Лесная мастерская',29,'Bold','#F7F4E9')
para(85,746,'Уют игры, крупные данные и иллюстрированные предметы.',660,17,26,color='#BECEB4')
line(813,674,813,778,'#52715D')
para(842,676,'Для вечерней версии - №2 «Лунная обсерватория».',490,18,26,'Bold','#F0E7CC')
para(842,738,'Для сложного крафта - плотность рабочих экранов №5.',490,16,24,color='#BECEB4')
text(60,830,'Следующий шаг: выбрать номер, затем проработать остальные вкладки и состояния в этом стиле.',15,color=MUTED)
footer(7,'ОЦЕНКИ АВТОРСКИЕ / МАКЕТЫ НУЖНЫ ДЛЯ ВЫБОРА ВИЗУАЛЬНОГО НАПРАВЛЕНИЯ')
c.showPage();c.save()
print(OUT)
