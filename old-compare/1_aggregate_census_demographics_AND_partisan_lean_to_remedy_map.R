### aggregate census and partisan lean data to cooper_congress maps

library(tidyverse)
library(sf)
library(scales)
library(openxlsx)
library(readxl)
# library(cleangeo)

options(scipen = 999)

####################
### INPUTS - change these to process new map

map_filepath <- "geo/processed/illustrative_maps/congress_cooper_illustrative_map_102604.shp"
dra_filepath <- "geo/processed/illustrative_maps/dra_drawing/district-statistics.csv"

out_shape_pgp <- "geo/output/cooper_congress/cooper_congress_pgp.geojson"
out_shape <- "geo/output/cooper_congress/cooper_congress.geojson"
out_shape_4326 <- "geo/output/cooper_congress/cooper_congress_4326.geojson"
out_shape_website <- "~/laravel/code/playground/public/Georgia-Explorer/data/congress_cooper.geojson"
out_df <- "data/output/cooper_congress.csv"
out_district_table <- "assessment/cooper_congress/cooper_congress_district_table.xlsx"

#### TO DO MANUALLY
# find the name of the district column and change "district" to new name on line 45
# Create folder for this remedy map in assessment

####################
### END INPUTS

### remedy map to aggregate too
remedy_map <- st_read(map_filepath) |> 
  st_make_valid() |> 
  rename(district = NAME)

### prepare the map for the new pgp assessment
# pgp_remedy <- remedy_map |> 
#   select(district, geometry) %>%
#   st_transform(., 4326)
# 
# st_write(pgp_remedy, out_shape_pgp)

### import census data
census_block <- st_read("geo/processed/vap_2020_block_30pct_data.geojson")

block_centroid <- st_read("geo/processed/vap_2020_block_CENTROID_data.geojson") |> 
  st_transform("ESRI:102604")

na <- census_block |> 
  filter(GEOID == "130490102002064")

### import precinct data
precinct <- st_read("geo/processed/precincts_2020_partisan_lean_70pct_clean.geojson")|> 
  st_transform("ESRI:102604")

# ### data to cooper_congress against
dra <- read_csv(dra_filepath) |>
  filter(ID != "Un") |>
  mutate(ID = as.numeric(ID))

remedy_map_blank <- remedy_map |> 
  select(district)  %>% 
  mutate(area = st_area(.),
         area = units::drop_units(area) * 3.86102e-7) |> 
  select(district, area, geometry)

#### Census data

### perform spatial intersection to aggregate
census_agg <- block_centroid |> 
  st_join(remedy_map_blank) 

remedy_map_demographics <- st_drop_geometry(census_agg) |> 
  group_by(district) |> 
  summarise(pop = sum(pop),
            vap = sum(total),
            white_al = sum(white_al),
            black_al = sum(black_al),
            asian_al = sum(asian_al),
            hisp = sum(hisp),
            vap_hisp = sum(total_hisp),
            bvap_ap = sum(bvap_ap),
            avap_ap = sum(avap_ap)) |> 
  mutate(pct_wvap_al = round(white_al/vap, 3), 
            pct_bvap_al = round(black_al/vap, 3), 
            pct_avap_al = round(asian_al/vap, 3), 
            pct_hvap = round(hisp/vap_hisp, 3), 
            pct_mvap = 1 - pct_wvap_al, 
            pct_bvap_ap = round(bvap_ap/vap, 3), 
            pct_avap_ap = round(avap_ap/vap, 3)) |> 
  select(district, pop, vap, pct_wvap_al:pct_avap_ap) 

#### Look at the NAs
summary(remedy_map_demographics)

remedy_map_demographics_no_na <- remedy_map_demographics |> 
  filter(!is.na(district))

#### add these if I want to compare my aggregation to dra or other calc
# |> 
#   left_join(st_drop_geometry(remedy_map), by = "district") |> 
#   left_join(dra, by = c("district" = "ID")) |> 
#   mutate(bvap_diff_pgp = pct_bvap_ap - pct_bvp,
#          mvap_diff_pgp = pct_mvap - pct_bp_,
#          hvap_diff_pgp = pct_hvap - pct_hvp,
#          avap_diff_pgp = pct_avap_ap - pct_avp,
#          bvap_diff_dra = pct_bvap_ap - Black,
#          mvap_diff_dra = pct_mvap - Minority,
#          hvap_diff_dra = pct_hvap - Hispanic,
#          avap_diff_dra = pct_avap_ap - Asian) |> 
#   select(district:pct_bp_, partisn:avap_diff_dra)


#### Partisan lean data
### perform spatial intersection to aggregate partisan data in the same way PGP did
partisan_join <- precinct |>
  st_join(remedy_map_blank, largest = T)

remedy_map_partisan_join <- st_drop_geometry(partisan_join) |>
  group_by(district) |>
  summarise(g18_tot_d = sum(g18_tot, na.rm = T),
            g18_dem_d = sum(g18_pct_dem * g18_tot, na.rm = T),
            p20_tot_d = sum(p20_tot, na.rm = T),
            p20_dem_d = sum(p20_pct_dem * p20_tot, na.rm = T),
            r21_tot_d = sum(r21_tot, na.rm = T),
            r21_dem_d = sum(r21_pct_dem * r21_tot, na.rm = T)) %>%
  mutate(g18_pct_dem = round(g18_dem_d / g18_tot_d, 3),
         p20_pct_dem = round(p20_dem_d / p20_tot_d, 3),
         r21_pct_dem = round(r21_dem_d / r21_tot_d, 3),
         partisan_lean = (g18_pct_dem + p20_pct_dem + r21_pct_dem)/3) |>
  select(district, partisan_lean, g18_pct_dem:r21_pct_dem) 


# |>
# ### add these if I want to compare my aggregation to dra or other calc
#   # left_join(st_drop_geometry(senate_pgp), by = "district") |>
#   left_join(dra, by = c("district" = "ID")) |>
#   mutate(partisn = round(partisn, 3),
#          partisan_diff_pgp = partisan_lean - partisn,
#          partisan_diff_dra = partisan_lean - Dem) |>
#   select(pop.x:r21_pct_dem, g18_tt_:partisn, partisan_lean, Dem, partisan_diff_pgp, partisan_diff_dra, district)

#### Create one file

remedy_map_estimates <- remedy_map_blank |> 
  left_join(remedy_map_demographics_no_na, by = "district") |> 
  left_join(remedy_map_partisan_join, by = "district") |> 
  select(-area)

remedy_map_estimates_4326 <- st_transform(remedy_map_estimates, 4326)

remedy_map_estimates_df <- st_drop_geometry(remedy_map_estimates)

remedy_map_estimates_formatted <- remedy_map_estimates_df |> 
  mutate(District = district,
         `Population` = pop,
         `Voting-Age Population` = vap,
         `Percent Black VAP` = round(pct_bvap_ap, 3),
         `Percent Asian VAP` = round(pct_avap_ap, 3),
         `Percent Hispanic VAP` = round(pct_hvap, 3),
         `Percent Minority VAP` = round(pct_mvap, 3),
         `Percent Black ALONE VAP` = round(pct_bvap_al, 3),
         `Estimated Percent Democrat (2018-21)` = round(partisan_lean, 3),
         `Estimated Percent Republican (2018-21)` = round(1 - partisan_lean, 3)) |> 
  # mutate(District = district,
  #        `Population` = comma(pop),
  #        `Voting-Age Population` = comma(vap),
  #        `Percent Black VAP` = percent(pct_bvap_ap, accuracy = .1),
  #        `Percent Asian VAP` = percent(pct_avap_ap, accuracy = .1),
  #        `Percent Hispanic VAP` = percent(pct_hvap, accuracy = .1),
  #        `Percent Minority VAP` = percent(pct_mvap, accuracy = .1),
  #        `Percent Black ALONE VAP` = percent(pct_bvap_al, accuracy = .1),
  #        `Estimated Percent Democrat (2018-21)` = percent(partisan_lean, accuracy = .1),
  #        `Estimated Percent Republican (2018-21)` = percent(1 - partisan_lean, accuracy = .1)) |> 
  select(District:`Estimated Percent Republican (2018-21)`)

### this is the format for the website: 
# 'pct_bvp', 'pct_hvp', 'pct_avp', 'pct_bp_', 'partisan'
remedy_map_website <- remedy_map_estimates_4326 |> 
  rename(pct_bvp = pct_bvap_ap, 
         pct_hvp = pct_hvap,
         pct_avp = pct_avap_ap,
         pct_bp_ = pct_mvap,
         partisan = partisan_lean,
         tvap = vap)

write_sf(remedy_map_website, out_shape_website)
  

write_sf(remedy_map_estimates, out_shape)
write_sf(remedy_map_estimates_4326, out_shape_4326)

write_csv(remedy_map_estimates_df, out_df)

### This is the table to share
write.xlsx(remedy_map_estimates_formatted, out_district_table)

