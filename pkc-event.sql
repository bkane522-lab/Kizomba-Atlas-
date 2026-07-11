-- Kizomba Atlas — Paris Kizomba Congress 2026
-- Exécuter après supabase-schema.sql.

insert into public.events (
  id, title_fr, title_en, description_fr, description_en, category,
  starts_at, ends_at, venue_name, address, city, country,
  latitude, longitude, price_text_fr, price_text_en, ticket_url, status
) values (
  'd83f8597-8ec1-4f8d-9f90-98b51b5c5ef6',
  'Paris Kizomba Congress 2026 — PKC',
  'Paris Kizomba Congress 2026 — PKC',
  'Événement international dédié à la Kizomba, au Semba, à la Tarraxinha et aux danses africaines. Le congrès est annoncé du 19 au 23 novembre 2026. Ce point GPS correspond précisément au festival principal organisé du 20 au 23 novembre au Hilton Paris Charles de Gaulle Airport. La préparty du 19 novembre se déroule séparément.',
  'An international event dedicated to Kizomba, Semba, Tarraxinha and African dances. The congress is announced for November 19–23, 2026. This GPS pin precisely marks the main festival venue, held November 20–23 at Hilton Paris Charles de Gaulle Airport. The November 19 pre-party is held separately.',
  'festival',
  '2026-11-20T20:00:00+01:00',
  '2026-11-23T07:00:00+01:00',
  'Hilton Paris Charles de Gaulle Airport',
  '8 Rue de Rome, 93290 Tremblay-en-France',
  'Tremblay-en-France',
  'France',
  49.010263,
  2.557379,
  'Full pass — voir la billetterie officielle',
  'Full pass — see official ticketing',
  'https://my.weezevent.com/paris-kizomba-congress-2026',
  'published'
)
on conflict (id) do update set
  title_fr = excluded.title_fr,
  title_en = excluded.title_en,
  description_fr = excluded.description_fr,
  description_en = excluded.description_en,
  category = excluded.category,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  venue_name = excluded.venue_name,
  address = excluded.address,
  city = excluded.city,
  country = excluded.country,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  price_text_fr = excluded.price_text_fr,
  price_text_en = excluded.price_text_en,
  ticket_url = excluded.ticket_url,
  status = excluded.status;
