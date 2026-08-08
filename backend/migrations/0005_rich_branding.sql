-- Alter tenants table to support rich branding features
ALTER TABLE tenants ADD COLUMN hero_image_url TEXT;
ALTER TABLE tenants ADD COLUMN gallery_images TEXT; -- JSON array of image URLs
ALTER TABLE tenants ADD COLUMN about_text TEXT;
ALTER TABLE tenants ADD COLUMN faq_items TEXT; -- JSON array of { question, answer }
ALTER TABLE tenants ADD COLUMN reviews TEXT; -- JSON array of { author, rating, text, date }
ALTER TABLE tenants ADD COLUMN map_embed_url TEXT;
ALTER TABLE tenants ADD COLUMN activities TEXT; -- comma-separated list of activities
ALTER TABLE tenants ADD COLUMN capacity INTEGER DEFAULT 50;

-- Update Tenant 1 (Acacia Camp) with professional mock data
UPDATE tenants SET
  hero_image_url = 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?q=80&w=1200&auto=format&fit=crop',
  gallery_images = '["https://images.unsplash.com/photo-1523429010052-b35a28adcf2c?q=80&w=600&auto=format&fit=crop", "https://images.unsplash.com/photo-1478131148067-21783f479669?q=80&w=600&auto=format&fit=crop", "https://images.unsplash.com/photo-1533873984035-25970ab07461?q=80&w=600&auto=format&fit=crop", "https://images.unsplash.com/photo-1496545672447-f699b503d270?q=80&w=600&auto=format&fit=crop"]',
  about_text = 'Acacia Camp has been providing premium outdoor wilderness programs and wilderness lodges in the heart of the Sinai Peninsula for over 15 years. We focus on teaching survival skills, climbing, desert navigation, and foster a deep respect for the natural environment. Our lodges are designed to merge rustic comfort with nature.',
  faq_items = '[{"question": "What is included in the lodging price?", "answer": "All standard cabins and suites include three daily organic meals, access to the central campfire, guided morning hikes, and water filtration facilities."}, {"question": "Is there mobile signal or Wi-Fi?", "answer": "We encourage a digital detox, but emergency satellite Wi-Fi is available in the main mess lodge. Individual cabins do not have signal."}, {"question": "What should I pack?", "answer": "Bring warm layers for cold desert nights, sturdy hiking boots, sunscreen, reusable water bottles, and a flashlight."}]',
  reviews = '[{"author": "David K.", "rating": 5, "text": "An absolutely life-changing experience. The wilderness lodges are beautiful, and stargazing in the Sinai desert is unmatched.", "date": "2026-05-14"}, {"author": "Sarah M.", "rating": 4, "text": "Excellent hiking guides and delicious fresh local meals. Highly recommend the deluxe lodge for families.", "date": "2026-06-02"}]',
  map_embed_url = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1773099.1672322303!2d32.748684784375005!3d29.8058296!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1500ed84ff93eab9%3A0xa19bf9cc3f8373b9!2sSinai%20Peninsula!5e0!3m2!1sen!2seg!4v1700000000000!5m2!1sen!2seg',
  activities = 'Hiking, Survival Skills, Wilderness Lodging, Stargazing, Campfires',
  capacity = 120
WHERE id = 'tenant_1';

-- Update Tenant 2 (Michael''s House) with professional mock data
UPDATE tenants SET
  hero_image_url = 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?q=80&w=1200&auto=format&fit=crop',
  gallery_images = '["https://images.unsplash.com/photo-1544551763-46a013bb70d5?q=80&w=600&auto=format&fit=crop", "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=600&auto=format&fit=crop", "https://images.unsplash.com/photo-1506929562872-bb421503ef21?q=80&w=600&auto=format&fit=crop", "https://images.unsplash.com/photo-1439066615861-d1af74d74000?q=80&w=600&auto=format&fit=crop"]',
  about_text = 'Michael''s House is a premier beach lodge located on the golden shores of Dahab, South Sinai. We specialize in water sports, windsurfing, marine preservation, and yoga. It is the perfect cozy environment for remote workers, ocean lovers, and families seeking a relaxed coastal vibe.',
  faq_items = '[{"question": "Do you provide snorkeling or diving gear?", "answer": "Yes, high-quality snorkeling masks, fins, and life jackets are free for all guests. Scuba gear can be rented at our marine house."}, {"question": "Is Michael''s House pet-friendly?", "answer": "Yes! We welcome friendly pets in all beach houses. Just notify us in advance."}, {"question": "Are there workspace facilities?", "answer": "Yes! We offer a high-speed fiber internet workspace with ocean views and complimentary coffee."}]',
  reviews = '[{"author": "Emma W.", "rating": 5, "text": "Perfect spot in Dahab! Waking up to the sound of waves and having fiber internet to work remotely was a dream come true.", "date": "2026-04-20"}, {"author": "John D.", "rating": 5, "text": "Outstanding windsurfing lessons and friendly community vibes. The family beach house is highly recommended.", "date": "2026-06-18"}]',
  map_embed_url = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d110825.12323380295!2d34.46820524450125!3d28.502011786524316!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1501436df7a07cd5%3A0xc07a82c478c93433!2sDahab%2C%20South%20Sinai%20Governorate!5e0!3m2!1sen!2seg!4v1700000000001!5m2!1sen!2seg',
  activities = 'Snorkeling, Kitesurfing, Windsurfing, Yoga, Coworking, Beach Volleyball',
  capacity = 60
WHERE id = 'tenant_2';
