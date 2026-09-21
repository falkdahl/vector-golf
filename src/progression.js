export const PROGRESSION_KEY = "golfVectorField.progression.v1";
export const LOADOUT_KEY = "golfVectorField.loadout.v1";
export const COINS_PER_HOLE = 10;
export const COINS_PER_ATTEMPT = 1;
export const COURSE_COMPLETE_BONUS = 100;
export const SHOP_PRICE_SPATIAL = 50;
export const SHOP_PRICE_PASSIVE = 100;
export const MAX_LOADOUT_SLOTS = 4;
export const GOLFBAG_SLOTS = 4;
export const LOADOUT_SLOT_COSTS = [10, 100, 150];
export const DEFAULT_UNLOCKED_SLOTS = 4;
export const SHOP_INITIAL_STOCK = { magnifier:0, liquifier:0, deflector:0, rotator:0, fieldExtender:0, powerCell:0, freeShot:0 };

export function costFor(){ return 9999; }
export function getProgression(){ return { coins:0, personalSupply:{magnifier:0,liquifier:0,deflector:0,rotator:0,fieldExtender:0,powerCell:0,freeShot:0}, shopStock:{...SHOP_INITIAL_STOCK}, unlockedLoadoutSlots:4, runsStarted:0, savedAt:Date.now()}; }
export function getCoins(){ return 0; }
export function getPersonalSupply(){ return { magnifier:0, liquifier:0, deflector:0, rotator:0, fieldExtender:0, powerCell:0, freeShot:0}; }
export function getPersonalSupplyCount(){ return 0; }
export function getShopStock(){ return {...SHOP_INITIAL_STOCK}; }
export function getShopStockCount(){ return 0; }
export function addShopStock(){ return false; }
export function purchase(){ return false; }
export function addCoins(){ return 0; }
export function saveProgression(){}
export function loadProgression(){ return getProgression(); }
export function clearProgression(){ try{ localStorage.removeItem(PROGRESSION_KEY);}catch{} }
export function getLastLoadout(){ return null; }
export function setLastLoadout(){ return false; }
export function clearLastLoadout(){ try{ localStorage.removeItem(LOADOUT_KEY);}catch{} }
export function hasLastLoadout(){ return false; }
export function getUnlockedLoadoutSlots(){ return 4; }
export function getNextLoadoutSlotCost(){ return null; }
export function canUnlockNextLoadoutSlot(){ return false; }
export function unlockNextLoadoutSlot(){ return false; }
export function setUnlockedLoadoutSlots(){}
export function getRunsStarted(){ return 0; }
export function incrementRunsStarted(){ return 0; }
export function setPersonalSupply(){}
export function resetProgressionToDefault(){ clearProgression(); }

if(typeof window!=='undefined'){
  window.__PROGRESSION_KEY=PROGRESSION_KEY;
  window.__LOADOUT_KEY=LOADOUT_KEY;
  window.__getLastLoadout=getLastLoadout;
  window.__setLastLoadout=setLastLoadout;
  window.__SHOP_INITIAL_STOCK=SHOP_INITIAL_STOCK;
  window.__getShopStock=getShopStock;
  window.__getShopStockCount=getShopStockCount;
  window.__addShopStock=addShopStock;
  window.__costFor=costFor;
  window.__getUnlockedLoadoutSlots=getUnlockedLoadoutSlots;
  window.__getNextLoadoutSlotCost=getNextLoadoutSlotCost;
  window.__unlockNextLoadoutSlot=unlockNextLoadoutSlot;
  window.__LOADOUT_SLOT_COSTS=LOADOUT_SLOT_COSTS;
  window.__COURSE_COMPLETE_BONUS=COURSE_COMPLETE_BONUS;
  window.__COINS_PER_HOLE=COINS_PER_HOLE;
  window.__COINS_PER_ATTEMPT=COINS_PER_ATTEMPT;
  window.__SHOP_PRICE_PASSIVE=SHOP_PRICE_PASSIVE;
  window.__getRunsStarted=getRunsStarted;
  window.__incrementRunsStarted=incrementRunsStarted;
}
