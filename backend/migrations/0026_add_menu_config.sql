-- Migration 0026: Add menu_config JSON column to tenants for interactive food menu

ALTER TABLE tenants ADD COLUMN menu_config TEXT; -- JSON: { categories: [...], whatsapp_number, currency }

-- Seed Sea La Vie style menu for tenant_1
UPDATE tenants SET menu_config = '{
  "title": "قائمة لا في دوسييه",
  "titleEn": "Sea La Vie Camp Menu",
  "subtitle": "أكل طازج من المطبخ ل-table",
  "whatsapp_number": "+201012345678",
  "currency": "EGP",
  "categories": [
    {
      "name": "المقبلات",
      "nameEn": "Appetizers",
      "color": "#800020",
      "items": [
        { "name": "حمص بالطحينة", "nameEn": "Hummus", "price": 35, "note": "يُقدّم مع خبز عربي طازج" },
        { "name": "بابا غنوج", "nameEn": "Baba Ganoush", "price": 35, "note": "" },
        { "name": "فتوش", "nameEn": "Fattoush Salad", "price": 30, "note": "" },
        { "name": "تبولة", "nameEn": "Tabbouleh", "price": 30, "note": "" },
        { "name": "ورق عنب", "nameEn": "Stuffed Grape Leaves", "price": 40, "note": "أرز باللحم المفروم" },
        { "name": "كنافة نابلسية", "nameEn": "Kunafa", "price": 45, "note": "جبن نابلسي طازج" }
      ]
    },
    {
      "name": "الأطباق الرئيسية",
      "nameEn": "Main Dishes",
      "color": "#1a365d",
      "items": [
        { "name": "مسوخان", "nameEn": "Musakhan", "price": 120, "note": "دجاج مشوي على الخبز مع بصل مكرمل وتوابل" },
        { "name": "منسف", "nameEn": "Mansaf", "price": 140, "note": "أرز مع لحم غنم وعيران" },
        { "name": "كبسة دجاج", "nameEn": "Kabsa Chicken", "price": 110, "note": "" },
        { "name": "مقلوبة", "nameEn": "Maqluba", "price": 100, "note": "أرز مع باذنجان ولحم" },
        { "name": "فريكة بالدجاج", "nameEn": "Freekeh Chicken", "price": 105, "note": "" },
        { "name": "رز بلحمر", "nameEn": "Rice with Meat", "price": 130, "note": "أرز مع لحم مطهو ببطء" }
      ]
    },
    {
      "name": "المشويات",
      "nameEn": "Grills & BBQ",
      "color": "#c9a227",
      "items": [
        { "name": "مشكل مشاوي", "nameEn": "Mixed Grill Platter", "price": 250, "note": "كباب، كفتة، شيش طاووق، ريتش" },
        { "name": "كباب لحم", "nameEn": "Beef Kebab", "price": 160, "note": "" },
        { "name": "شيش طاووق", "nameEn": "Shish Tawouk", "price": 140, "note": "دجاج متبل بالتوابل اللبنانية" },
        { "name": "كفتة مشوية", "nameEn": "Grilled Kofta", "price": 130, "note": "" },
        { "name": "سمك مشوي", "nameEn": "Grilled Fish", "price": 180, "note": "سمك طازج من البحر الأحمر" }
      ]
    },
    {
      "name": "المشروبات",
      "nameEn": "Drinks",
      "color": "#d97706",
      "items": [
        { "name": "شاي بالنعناع", "nameEn": "Mint Tea", "price": 15, "note": "" },
        { "name": "قهوة عربية", "nameEn": "Arabic Coffee", "price": 20, "note": "" },
        { "name": "عصير برتقال طازج", "nameEn": "Fresh Orange Juice", "price": 25, "note": "" },
        { "name": "عصير مانجو", "nameEn": "Mango Juice", "price": 25, "note": "" },
        { "name": "ليمون بالنعناع", "nameEn": "Lemon Mint", "price": 20, "note": "" },
        { "name": "ميّ معدنية", "nameEn": "Water Bottle", "price": 10, "note": "" },
        { "name": "بيبسي", "nameEn": "Pepsi", "price": 15, "note": "" }
      ]
    },
    {
      "name": "الحلويات",
      "nameEn": "Desserts",
      "color": "#047857",
      "items": [
        { "name": "بقلاوة", "nameEn": "Baklava", "price": 45, "note": "متنوعة بالفستق والجوز" },
        { "name": "أم علي", "nameEn": "Om Ali", "price": 50, "note": "حلوى مصرية تقليدية" },
        { "name": "كعك بالتمر", "nameEn": "Date Cake", "price": 35, "note": "" },
        { "name": "مهلبية", "nameEn": "Mahalabia", "price": 30, "note": "حليب بالمسك" }
      ]
    },
    {
      "name": "الآيس كريم",
      "nameEn": "Ice Cream",
      "color": "#0891b2",
      "items": [
        { "name": "آيس كريم", "nameEn": "Ice Cream Scoop", "price": 25, "price2": 45, "price2Label": "2 سكوب", "note": "فراولة، شوكولاتة، فانيليا، مانجو" },
        { "name": "آيس كريم سندوتش", "nameEn": "Ice Cream Sandwich", "price": 30, "note": "" },
        { "name": "أرقان", "nameEn": "Arabic Ice Cream", "price": 35, "note": "آيس كريم بالفستق والموز" }
      ]
    }
  ]
}' WHERE id = 'tenant_1';
