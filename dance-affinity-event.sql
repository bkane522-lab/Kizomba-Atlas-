-- Kizomba Atlas — Dance Affinity Festival 2026
-- Exécuter après supabase-schema.sql.

insert into public.events (
  id, title_fr, title_en, description_fr, description_en, category, styles,
  starts_at, ends_at, venue_name, address, city, country,
  latitude, longitude, organizer_name, price_text_fr, price_text_en, ticket_url, status
) values (
  '8f57a8f9-d9c8-4be8-a9d4-4dcd88cc3f26',
  'Dance Affinity Festival 2026',
  'Dance Affinity Festival 2026',
  'Festival à Fribourg-en-Brisgau réunissant Kizomba et Bachata. Le programme annoncé comprend des bootcamps immersifs, des workshops, des soirées et des socials. L’EVOKEEZ Bootcamp réunit Martina & Lea, Andrea & Aurélie, Antho & Caro : 6 professeurs, 3 heures de travail et des places limitées.',
  'A festival in Freiburg im Breisgau bringing together Kizomba and Bachata. The announced programme includes immersive bootcamps, workshops, parties and socials. The EVOKEEZ Bootcamp features Martina & Lea, Andrea & Aurélie, Antho & Caro: 6 teachers, 3 hours of training and limited places.',
  'festival',
  ARRAY['kizomba','bachata','sbk'],
  '2026-10-30T20:00:00+01:00',
  '2026-11-02T04:00:00+01:00',
  'M.A.K Studio',
  'Kaiser-Joseph-Straße 268, 79098 Freiburg im Breisgau',
  'Freiburg im Breisgau',
  'Allemagne',
  47.991997,
  7.848298,
  'Dance Affinity Festival',
  'Voir la billetterie officielle',
  'See official ticketing',
  'https://my.weezevent.com/dance-affinity-2026',
  'published'
)
on conflict (id) do update set
  title_fr = excluded.title_fr,
  title_en = excluded.title_en,
  description_fr = excluded.description_fr,
  description_en = excluded.description_en,
  category = excluded.category,
  styles = excluded.styles,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  venue_name = excluded.venue_name,
  address = excluded.address,
  city = excluded.city,
  country = excluded.country,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  organizer_name = excluded.organizer_name,
  price_text_fr = excluded.price_text_fr,
  price_text_en = excluded.price_text_en,
  ticket_url = excluded.ticket_url,
  status = excluded.status,
  updated_at = now();
