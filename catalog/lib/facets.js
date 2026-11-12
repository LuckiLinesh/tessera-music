/* Facets shared by search and explore. Country codes are ISO 3166-1 alpha-2
   because that is what MusicBrainz stores. */

export const COUNTRIES = [
  ['', 'Any country'],
  ['US', 'United States'], ['GB', 'United Kingdom'], ['NG', 'Nigeria'], ['BR', 'Brazil'],
  ['JP', 'Japan'], ['IN', 'India'], ['JM', 'Jamaica'], ['ML', 'Mali'], ['CU', 'Cuba'],
  ['KR', 'South Korea'], ['SN', 'Senegal'], ['MX', 'Mexico'], ['IS', 'Iceland'],
  ['SE', 'Sweden'], ['FR', 'France'], ['DE', 'Germany'], ['IT', 'Italy'], ['ES', 'Spain'],
  ['PT', 'Portugal'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['PL', 'Poland'],
  ['RU', 'Russia'], ['UA', 'Ukraine'], ['TR', 'Turkey'], ['EG', 'Egypt'], ['MA', 'Morocco'],
  ['ZA', 'South Africa'], ['KE', 'Kenya'], ['ET', 'Ethiopia'], ['GH', 'Ghana'],
  ['CI', "Cote d'Ivoire"], ['CM', 'Cameroon'], ['CD', 'DR Congo'], ['AO', 'Angola'],
  ['MZ', 'Mozambique'], ['TZ', 'Tanzania'], ['UG', 'Uganda'], ['ZW', 'Zimbabwe'],
  ['AR', 'Argentina'], ['CL', 'Chile'], ['CO', 'Colombia'], ['PE', 'Peru'], ['VE', 'Venezuela'],
  ['UY', 'Uruguay'], ['PY', 'Paraguay'], ['BO', 'Bolivia'], ['EC', 'Ecuador'],
  ['CR', 'Costa Rica'], ['PA', 'Panama'], ['DO', 'Dominican Republic'], ['PR', 'Puerto Rico'],
  ['HT', 'Haiti'], ['TT', 'Trinidad and Tobago'], ['BB', 'Barbados'], ['CA', 'Canada'],
  ['AU', 'Australia'], ['NZ', 'New Zealand'], ['ID', 'Indonesia'], ['MY', 'Malaysia'],
  ['PH', 'Philippines'], ['TH', 'Thailand'], ['VN', 'Vietnam'], ['SG', 'Singapore'],
  ['CN', 'China'], ['TW', 'Taiwan'], ['HK', 'Hong Kong'], ['PK', 'Pakistan'],
  ['BD', 'Bangladesh'], ['LK', 'Sri Lanka'], ['NP', 'Nepal'], ['MM', 'Myanmar'],
  ['KZ', 'Kazakhstan'], ['UZ', 'Uzbekistan'], ['AZ', 'Azerbaijan'], ['GE', 'Georgia'],
  ['AM', 'Armenia'], ['IR', 'Iran'], ['IQ', 'Iraq'], ['IL', 'Israel'], ['SA', 'Saudi Arabia'],
  ['AE', 'United Arab Emirates'], ['QA', 'Qatar'], ['JO', 'Jordan'], ['LB', 'Lebanon'],
  ['GR', 'Greece'], ['AT', 'Austria'], ['CH', 'Switzerland'], ['IE', 'Ireland'],
  ['NO', 'Norway'], ['FI', 'Finland'], ['DK', 'Denmark'], ['CZ', 'Czechia'],
  ['SK', 'Slovakia'], ['HU', 'Hungary'], ['RO', 'Romania'], ['BG', 'Bulgaria'],
  ['HR', 'Croatia'], ['RS', 'Serbia'], ['SI', 'Slovenia'], ['BA', 'Bosnia and Herzegovina'],
  ['MK', 'North Macedonia'], ['AL', 'Albania'], ['EE', 'Estonia'], ['LV', 'Latvia'],
  ['LT', 'Lithuania'], ['BY', 'Belarus'], ['MD', 'Moldova'],
];

export const GENRES = [
  '', 'rock', 'pop', 'jazz', 'blues', 'soul', 'funk', 'hip hop', 'rap', 'electronic', 'house',
  'techno', 'ambient', 'classical', 'folk', 'country', 'reggae', 'ska', 'metal', 'punk', 'indie',
  'alternative', 'r&b', 'gospel', 'latin', 'salsa', 'cumbia', 'bossa nova', 'afrobeat', 'highlife',
  'amapiano', 'k-pop', 'city pop', 'bollywood', 'flamenco', 'fado', 'qawwali', 'gamelan', 'dub',
  'disco', 'trance', 'drum and bass',
];

export const DECADES = ['', '2020', '2010', '2000', '1990', '1980', '1970', '1960', '1950', '1940', '1930', '1920'];

export const countryName = (code) =>
  COUNTRIES.find(([value]) => value === code)?.[1] || code || 'Anywhere';
