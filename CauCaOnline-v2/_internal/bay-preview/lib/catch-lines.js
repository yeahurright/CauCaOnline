const { isNonFishItem, fishSaleXu } = require('./fish-sale');

const TRASH_JEERS = [
  'Rác này đem bỏ giùm cái!',
  'Hồ sạch mới có cá, đừng vứt rác nha!',
  'Câu được rác, xui cả buổi!',
  'Cái này cho vào thùng rác nha cả nhà!',
  'Rác mà cũng cắn cần, lạ thật!',
  'Nhặt rác lên bờ giùm hồ cái nào!',
  'Cái này mà đem về thì mẹ mắng cho!',
  'Ủng này có chủ rồi, trả đi nha!',
  'Lốp xe này chạy còn xa hơn cá!',
  'Chai nhựa thì bỏ vô thùng xanh nha!',
  'Dép lẻ, ai tìm giùm chiếc kia với!',
  'Xô rách thì đựng gì cũng tuột!',
  'Cá thấy rác cũng bơi mất tiêu rồi!',
  'May là vẫn được tính một con nha!',
  'Cái này ra chợ ve chai được năm ngàn!',
  'Rác lên bờ, cá ở lại, hên chi lạ!'
];

const DISH_LINES = [
  'Con này nấu canh chua hết sảy!',
  'Đem chiên giòn là bá cháy!',
  'Hấp gừng thì khỏi bàn!',
  'Nướng trui là số dzách!',
  'Lẩu cá là hết ý!',
  'Kho tộ thì tốn cơm lắm!',
  'Gỏi cá thì phải gọi là tuyệt!',
  'Chưa gì đã thấy thơm rồi!',
  'Đem nấu cháo là ngon nhất!',
  'Ướp sả nướng là hết chỗ chê!',
  'Lẩu chua cay với con này là đỉnh!',
  'Chiên xù chấm mắm gừng, hết nước chấm!',
  'Kho khô ăn cơm nóng là hết ý!',
  'Nấu cháo đầu cá, ấm bụng cả buổi!',
  'Hấp xì dầu rắc hành lá là xong!',
  'Nướng muối ớt, thơm lừng cả xóm!',
  'Làm gỏi xoài, chua ngọt là ghiền!',
  'Om chuối đậu thì hao cơm báo thủ!',
  'Hấp bia, ngọt thịt lắm nha!',
  'Rán vàng hai mặt, rưới nước mắm là xong bữa!',
  'Canh chua bông so đũa, đúng bài luôn!',
  'To thế này thì phải làm tiệc thôi cả nhà ơi!',
  'Lẩu mắm dọn thêm rau là hết chỗ chê!',
  'Ướp nghệ nướng than hoa, thơm lừng!',
  'Bằm làm chả cá chiên lên là mê!'
];

const TINY_JEERS = [
  'Bé thế này thì chiên đúng một miếng!',
  'Cá này để làm mồi câu con to nha!',
  'Thả lại hồ cho nó lớn thêm chút đi!',
  'Bé xíu mà cũng dám cắn cần!',
  'Cân chưa bằng cái thìa, cả nhà ơi!',
  'Con này chắc mới ra khỏi trứng!',
  'Cá bột mà cũng kéo căng cần!',
  'Đem về nuôi trong ly cho đáng yêu!',
  'Nhân phẩm hôm nay hơi... khiêm tốn!'
];

const CONGRATS_POOL = [
  (n, f, w) => `Chúc mừng cần thủ ${n} vừa lôi lên con ${f} nặng ${w} ký! Bự quá cả nhà ơi!`,
  (n, f, w) => `Ôi giời ơi, ${n} vừa câu được ${f} ${w} ký! Cần thủ này tay to thật!`,
  (n, f, w) => `${n} ơi là ${n}, giật được ${f} ${w} ký, quá đỉnh!`,
  (n, f, w) => `Bắt được ${f} ${w} ký rồi! ${n} hôm nay ăn lộc hồ này rồi!`,
  (n, f, w) => `${f} ${w} ký đã lên bờ! ${n} câu hay quá, cả hồ vỗ tay!`,
  (n, f, w) => `Nặng ${w} ký! ${f} về tay ${n}, cả hồ vỗ tay nào!`,
  (n, f, w) => `${n} vừa hạ gục ${f} ${w} ký. Hồ này hôm nay không yên rồi!`,
  (n, f, w) => `Trời ơi ${f} ${w} ký! ${n} câu kiểu gì mà ghê vậy trời!`,
  (n, f, w) => `Cần thủ ${n} chính thức ghi danh với ${f} ${w} ký!`,
  (n, f, w) => `${f} ${w} ký! ${n} ơi mở tiệc đi, cả hồ chờ mồi!`,
  (n, f, w) => `Ai bảo hồ này ít cá? ${n} vừa kéo lên ${f} ${w} ký kìa!`,
  (n, f, w) => `${n} câu được ${f} ${w} ký. Tay này chắc tập gym mỗi ngày!`,
  (n, f, w) => `Cả nhà nhìn kìa, ${f} ${w} ký! ${n} làm được rồi!`,
  (n, f, w) => `${n} vừa rinh về ${f} ${w} ký. Phao còn rung trên mặt nước kìa!`,
  (n, f, w) => `Một con ${f} ${w} ký cho ${n}! Cá này chắc nặng hơn cả cái xe máy!`
];

const SMALL_POOL = [
  (n, f, w) => `${n} được ${f} ${w} ký!`,
  (n, f, w) => `${w} ký cho ${n}!`,
  (n, f, w) => `${n} ăn ${f} ${w} ký!`,
  (n, f, w) => `Cá nhỏ, ${n} được ${w} ký!`,
  (n, f, w) => `${n} câu được ${w} ký, tiếp nào!`,
  (n, f, w) => `${w} ký vào giỏ ${n}!`,
  (n, f, w) => `${n} có ${f} ${w} ký!`,
  (n, f, w) => `Nhẹ nhàng ${w} ký cho ${n}!`
];

function createCatchLines({ catalog, speciesLines, jokes, tiny, nonFish, fun, medium, adam, mega, rod, effects,
  aphorisms, flavors, sales }) {
  const entries = [];
  const add = (key, lines, allows, render = (phrase, c) => typeof phrase === 'function'
    ? phrase(c.name, c.fish.name, c.kg) : phrase) => {
    lines.forEach((phrase, index) => entries.push({
      id: key + ':' + index, allows: c => c.fish?.escaped ? key === 'escaped' : allows(c), render: c => render(phrase, c)
    }));
  };
  const live = c => c.healthy;
  const tinyFish = c => live(c) && c.kg < 1;
  const everyday = c => live(c) && c.kg >= 1 && c.kg < 15;
  const large = c => live(c) && c.kg >= 15;
  const trash = c => c.item && c.fish.isTrash;
  const relic = c => c.item && !c.fish.isTrash;
  add('miss', rod, c => c.fish.rodBroken);
  add('recorded-miss', jokes.missed, c => c.fish.rodBroken);
  add('escaped', ['Pha này cá thắng một không nha!', 'Cá ăn mồi xong trốn luôn rồi!', 'Cá hẹn lần sau, cần thủ đừng buồn nha!'], c => c.fish.escaped);
  add('old-trash', TRASH_JEERS, trash);
  add('recorded-trash', jokes.trash, trash);
  add('recorded-relic', jokes.item, relic);
  add('old-small-jokes', TINY_JEERS, tinyFish);
  add('recorded-small', jokes.tiny, tinyFish);
  add('recorded-fish', jokes.fish, everyday);
  add('recorded-big', jokes.big, large);
  add('old-dishes', DISH_LINES, live);
  add('old-congrats', CONGRATS_POOL, c => live(c) && c.kg >= 5);
  add('old-small-congrats', SMALL_POOL, c => live(c) && c.kg < 5);
  add('small', tiny, tinyFish);
  add('item', nonFish, c => c.item);
  add('fun', fun, everyday);
  add('congrats', medium, c => live(c) && c.kg >= 5);
  add('adam', adam, c => live(c) && c.kg >= 5);
  add('mega', mega, c => live(c) && c.kg >= 30);
  add('big-flavor', flavors, large);
  add('pond', aphorisms, c => c.aphorism === true);
  add('sale', sales, c => c.healthy && c.xu > 0, (phrase, c) => phrase(c.xu));
  add('spoiled', ['Lượt này hơi xui rồi!', 'Cá nghỉ sớm hơn cần thủ rồi!'], c => !c.fish.rodBroken && !c.item && !c.healthy);
  add('sale-zero', ['Bán được 0 xèng.'], c => !c.fish.rodBroken && c.xu === 0);
  add('natural-fish', ['Kéo đẹp lắm!'], live);
  add('natural-small', ['Bé xíu à!'], tinyFish);
  add('natural-large', ['Cong cả cần!'], large);
  add('natural-trash', ['Dọn hồ luôn!'], trash);

  for (const fish of catalog) {
    const matches = c => !c.fish.rodBroken && c.fish.id === fish.id && (c.item || c.healthy);
    const species = speciesLines[fish.name];
    if (species) {
      add('species-cheer:' + fish.id, [species.cheer], matches, (phrase, c) => phrase(c.name, c.kg));
      add('species-tease:' + fish.id, [species.tease], c => matches(c) &&
        (c.item || c.kg <= (fish.minWeight + fish.maxWeight) / 2), (phrase, c) => phrase(c.name, c.kg));
    }
    if (fish.ttsSummary) add('catalog:' + fish.id, [fish.ttsSummary], matches);
  }
  for (const [id, effect] of Object.entries(effects)) {
    const match = c => !c.fish.rodBroken && !c.item && c.effect?.id === id;
    add('effect:' + id, effect.remarks, match);
    add('effect-sale:' + id, effect.sales, c => match(c) && c.xu != null, (phrase, c) => phrase(c.xu));
  }
  return entries;
}

function catchContext(name, fish) {
  const item = isNonFishItem(fish);
  const effect = fish.anomalyEffect || fish.mutation;
  const spoiled = ['dead', 'infected', 'suffocated', 'bleeding'].includes(effect?.id) || effect?.multiplier === 0;
  return { name, fish, item, effect, kg: fish.weightKg, xu: fishSaleXu(fish),
    healthy: !fish.rodBroken && !fish.escaped && !item && !spoiled };
}

function formatCatchText(context, remark, rodCost) {
  const { name, fish, item, effect, kg } = context;
  if (fish.escaped) return 'Tiếc quá, ' + name + ' câu hụt ' + fish.name + ' nặng ' + kg + ' ký. ' + remark;
  if (fish.rodBroken) return 'Gãy cần rồi, ' + name + ' câu ' + fish.name + ' nặng ' + kg
    + ' ký nhưng không thành! ' + remark + ' Tốn ' + rodCost + ' xèng mua cần mới.';
  const hasResult = remark.includes(fish.name) && remark.includes(String(kg)) && remark.includes(name);
  const lead = (item ? '' : 'Chúc mừng! ') + name + ' câu được ' + fish.name + ' nặng ' + kg + ' ký.';
  const line = hasResult ? (item || /^chúc mừng/i.test(remark) ? remark : 'Chúc mừng! ' + remark) : lead + ' ' + remark;
  if (!effect) return line;
  const report = (context.healthy ? 'Có hiệu ứng ' : 'Cá bị ') + effect.name.toLocaleLowerCase('vi-VN') + '.';
  const description = !effect.description || /(?:0|không) xèng/i.test(line) && effect.multiplier === 0
    ? '' : ' ' + effect.description.replace(/×/g, 'gấp ');
  return line + ' ' + report + description;
}

function reserveCatchLine(entries, context, played, reserved) {
  let selected = null;
  for (const line of entries) {
    if (!line.allows(context)) continue;
    const weight = (played[line.id] || 0) + (reserved.get(line.id) || 0);
    if (!selected || weight < selected.weight) selected = { line, weight };
  }
  if (!selected) return null;
  const { line } = selected;
  reserved.set(line.id, (reserved.get(line.id) || 0) + 1);
  let finished = false;
  return {
    id: line.id, text: line.render(context),
    finish(heard) {
      if (finished) return;
      finished = true;
      const remaining = reserved.get(line.id) - 1;
      if (remaining) reserved.set(line.id, remaining);
      else reserved.delete(line.id);
      if (heard) played[line.id] = (played[line.id] || 0) + 1;
    }
  };
}

module.exports = { createCatchLines, catchContext, formatCatchText, reserveCatchLine };
