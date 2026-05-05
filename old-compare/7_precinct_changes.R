### create table and map of previous and current district, by precinct for remedy maps

library(tidyverse)
library(sf)
library(tmap)
library(cleangeo)
library(openxlsx)
library(readxl)
options(scipen = 999)


####################
### INPUTS - change these to process new map

summary_table_filepath <- "assessment/cooper_congress/cooper_congress_district_summary_table.xlsx"

remedy_map_filepath <- "geo/output/cooper_congress/cooper_congress_4326.geojson"
# remedy_map_filepath <- "~/spatial/FDGA/Data/geography/current/congress_proposed3_all_2020_data.shp"
  
# enacted_filepath <- "~/spatial/FDGA/Data/geography/current/congress_enacted_all_2020_data.shp"

# ### CHOOSE
# ### this is a tester
# enacted_filepath <- "~/spatial/FDGA/Data/geography/current/senate_enacted_all_2020_data.shp"

enacted_filepath <- "geo/current/enacted_congress22_40pct.geojson"
# enacted_filepath <- "geo/current/enacted_senate22_40pct.geojson"
# enacted_filepath <- "geo/current/enacted_house22_40pct.geojson"


out_datapath <- "geo/output/cooper_congress/"
out_mappath <- "assessment/cooper_congress/maps/changes/"
out_filepath_legend <- "assessment/cooper_congress/maps/with_legend/" ### this is for the enacted and remedy labelled map
out_filepath <- "assessment/cooper_congress/maps/" ### this is for the enacted and remedy labelled map
dtype = "cooper_congress"
fontsize = 4
highres_fontsize = 8

####################
### END INPUTS


####### BEGIN IMPORTING DATA

cities <- st_read("~/spatial/FDGA/Data/geography/GA_places_2020.shp")

atl <- cities |> 
  filter(GEOCODE == "1304000")

macon <- cities |> 
  filter(GEOCODE == "1349008")

####### precincts to measure changes in partisan lean and movement of D & R

### getting the tvap data to calculate dem and rep voters layers
precinct_data <- st_read("~/spatial/FDGA/Data/geography/census-2020/processed/precinct_2020.geojson") |> 
  st_drop_geometry() |> 
  select(geoid20, tvap)

### this is the precincts that PGP used for the ensemble
precinct_shp <- st_read("geo/processed/precincts_2020_partisan_lean_70pct_clean.geojson") |> 
  st_transform("ESRI:102604") %>% 
  mutate(area = (units::drop_units(st_area(.))) * 3.58701e-8) |> 
  left_join(precinct_data, by = "geoid20")

####### census data to measure changes in demographics and BVAP specifically
block_centroid <- st_read("geo/processed/vap_2020_block_CENTROID_data.geojson") |> 
  st_transform("ESRI:102604")

##### district maps
### this is the currently enacted map (make sure you have selected the correct one in the inputs)
enacted_data <- st_read(enacted_filepath) 

enacted_df <- st_drop_geometry(enacted_data) |> 
  # select(-label, GEOID20) |> 
  # rename(district = distrct) |> 
  rename_with(~ paste0(., "_enacted"), -all_of("district")) |> 
  mutate(district = as.numeric(district))

enacted <- enacted_data |> 
  select(district) |> 
  rename(enacted = district) |> 
  st_transform("ESRI:102604") %>%
  mutate(enacted_area = (units::drop_units(st_area(.))) * 3.58701e-8)

### this is the remedy map that we are cooper_congressing
remedy_data <- st_read(remedy_map_filepath) 
# |> 
#   rename(district = distrct)
remedy_df <- st_drop_geometry(remedy_data) |> 
  rename_with(~ paste0(., "_remedy"), -all_of("district")) |> 
  mutate(district = as.numeric(district))

remedy <- remedy_data |> 
  select(district) |> 
  rename(proposed = district) |> 
  st_transform("ESRI:102604") %>%
  mutate(remedy_area = (units::drop_units(st_area(.))) * 3.58701e-8)

### number of districts
dist_count = length(remedy_df)


### PRECINCT intersect with proposed
precinct_proposed <- st_intersection(precinct_shp, remedy) 

precinct_proposed$int_area <- (units::drop_units(st_area(precinct_proposed)) * 3.58701e-8)

precinct_proposed_shp <- precinct_proposed |> 
  mutate(pct_proposed_precinct = round(int_area/area, 3)) |> 
  filter(pct_proposed_precinct > .1)

### the precinct is assigned to the district with the largest intersection
precinct_proposed_df <- st_drop_geometry(precinct_proposed_shp) |> 
  mutate(pct_precinct = round(int_area/area, 2)) |> 
  group_by(geoid20) |> 
  filter(int_area == max(int_area))

### PRECINCT intersect with enacted
precinct_enacted <- st_intersection(precinct_shp, enacted) 

precinct_enacted$int_area <- (units::drop_units(st_area(precinct_enacted)) * 3.58701e-8)

precinct_enacted_shp <- precinct_enacted |> 
  mutate(pct_enacted_precinct = round(int_area/area, 3)) |> 
  filter(pct_enacted_precinct > .1)

### the precinct is assigned to the district with the largest intersection
precinct_enacted_df <- st_drop_geometry(precinct_enacted_shp) |> 
  mutate(pct_precinct = round(int_area/area, 2)) |> 
  group_by(geoid20) |> 
  filter(int_area == max(int_area)) |> 
  select(-namelsad20, -vtdi20, -vtdst20, -name20) |> 
  rename_with(~ paste0(., "_enacted"), -all_of(c("geoid20", "enacted")))

precinct_analysis <- precinct_proposed_df |> 
  select(-namelsad20, -vtdi20, -vtdst20) |>
  rename_with(~ paste0(., "_remedy"), -all_of(c("geoid20", "name20", "proposed"))) |>
  left_join(precinct_enacted_df, by = "geoid20") |> 
  mutate(changed = if_else(enacted == proposed, "same", "different"),
         removed_from = ifelse(changed == "different", enacted, NA),
         added_to = ifelse(changed == "different", proposed, NA),
         dem_estimate_enacted = round(tvap_enacted * partisan_enacted, 0),
         rep_estimate_enacted = tvap_enacted - dem_estimate_enacted,
         dem_estimate_remedy = round(tvap_remedy * partisan_remedy, 0),
         rep_estimate_remedy = tvap_remedy - dem_estimate_remedy)

precinct_shp_change <- precinct_shp |> 
  left_join(select(precinct_analysis, geoid20, enacted, proposed, changed:rep_estimate_remedy), by = "geoid20") 

precinct_shp_change_4326 <- precinct_shp_change |> 
  st_transform(4326)

### write out
# write_sf(precinct_shp_change_4326, paste0(out_datapath, dtype, "_remedy_map_precinct_changes.geojson"))
# 
# write_csv(precinct_analysis, paste0(out_datapath, dtype, "_remedy_map_precinct_changes.csv"))

###### Census Block join to assess race changes

census_remedy <- block_centroid |> 
  st_join(remedy) 

census_enacted <- block_centroid |> 
  st_join(enacted) 

census_enacted_df <- st_drop_geometry(census_enacted) |> 
  rename_with(~ paste0(., "_enacted"), -all_of("GEOID")) |> 
  rename(enacted = enacted_enacted)

census_remedy_df <- st_drop_geometry(census_remedy) %>%
  rename_with(~ paste0(., "_remedy"), -all_of("GEOID")) |> 
  rename(proposed = proposed_remedy) |> 
  select(GEOID:proposed) |> 
  left_join(census_enacted_df, by = ("GEOID")) |> 
  mutate(changed = if_else(enacted == proposed, "same", "different"),
         removed_from = ifelse(changed == "different", enacted, NA),
         added_to = ifelse(changed == "different", proposed, NA))

######### Change Analysis  ############

##### Precincts

### calculate what districts each precinct was removed form and added to
removed_p <- precinct_analysis |> 
  group_by(removed_from) |> 
  summarise(removed_dems_est = sum(dem_estimate_enacted, na.rm=T),
            removed_reps_est = sum(rep_estimate_enacted, na.rm=T)) |> 
  filter(!is.na(removed_from)) |> 
  mutate(removed_from = as.numeric(removed_from))


added_p <- precinct_analysis |> 
  group_by(added_to) |> 
  summarise(added_dems_est = sum(dem_estimate_remedy, na.rm=T),
            added_reps_est = sum(rep_estimate_remedy, na.rm=T)) |> 
  filter(!is.na(added_to)) |> 
  mutate(added_to = as.numeric(added_to))

pop_p <- precinct_analysis |> 
  group_by(proposed) |> 
  summarise(tvap_remedy_precinct = sum(tvap_remedy, na.rm=T)) |> 
  mutate(proposed = as.numeric(proposed))

pop_e <- precinct_analysis |> 
  group_by(enacted) |> 
  summarise(tvap_enacted_precinct = sum(tvap_enacted, na.rm=T)) |> 
  mutate(enacted = as.numeric(enacted))

##### Census

### calculate what districts each precinct was removed from and added to
removed_c <- census_remedy_df |> 
  group_by(removed_from) |> 
  summarise(removed_pop = sum(pop_enacted, na.rm=T),
            removed_avap = sum(avap_ap_enacted, na.rm=T),
            removed_bvap = sum(bvap_ap_enacted, na.rm=T),
            removed_hvap = sum(hisp_enacted, na.rm=T),
            removed_mvap = sum(total_enacted - white_al_enacted, na.rm=T),
            removed_tvap = sum(total_enacted, na.rm=T)) |> 
  filter(!is.na(removed_from))|> 
  mutate(removed_from = as.numeric(removed_from))


added_c <- census_remedy_df |> 
  group_by(added_to) |> 
  summarise(added_pop = sum(pop_enacted, na.rm=T),
            added_avap = sum(avap_ap_enacted, na.rm=T),
            added_bvap = sum(bvap_ap_enacted, na.rm=T),
            added_hvap = sum(hisp_enacted, na.rm=T),
            added_mvap = sum(total_enacted - white_al_enacted, na.rm=T),
            added_tvap = sum(total_enacted, na.rm=T)) |> 
  filter(!is.na(added_to)) |> 
  mutate(added_to = as.numeric(added_to))

### calculate ideal pop
ideal_pop = round(sum(remedy_df$pop_remedy)/dist_count, 0)

### rename enacted
remedy_analysis <- remedy_df |>
  left_join(enacted_df, by = "district") |>
  left_join(removed_p, by = c("district" = "removed_from")) |>
  left_join(added_p, by = c("district" = "added_to")) |>
  left_join(pop_p, by = c("district" = "proposed")) |>
  left_join(pop_e, by = c("district" = "enacted")) |>
  left_join(removed_c, by = c("district" = "removed_from")) |>
  left_join(added_c, by = c("district" = "added_to")) %>%
  mutate_all(~ ifelse(is.na(.), 0, .)) |>
  rename(pct_bvap_enacted = pct_bvp_enacted,
         pct_bvap_remedy = pct_bvap_ap_remedy,  # pct_bvap_ap,
         partisan_enacted = partisan_enacted,
         partisan_remedy = partisan_lean_remedy, # partisan_lean,
         tvap_remedy = vap_remedy,
         pct_mvap_enacted = pct_bp__enacted) |>
  mutate(pct_pop_removed = round(removed_pop/pop_enacted, 2),
         pct_tvap_removed = round(removed_tvap/tvap_enacted_precinct, 2),
         pct_bvap_removed = round(removed_bvap/bvap_enacted, 2),
         pct_dems_removed = round(removed_dems_est/(tvap_enacted_precinct*partisan_enacted), 2),
         pct_reps_removed = round(removed_reps_est/(tvap_enacted_precinct*(1-partisan_enacted)), 2),
         pct_pop_added = round(added_pop/pop_remedy, 2),
         pct_tvap_added = round(added_tvap/tvap_remedy_precinct, 2),
         pct_bvap_added = round(added_bvap/(pct_bvap_remedy*tvap_remedy_precinct), 2),
         pct_dems_added = round(added_dems_est/(tvap_remedy_precinct*partisan_remedy), 2),
         pct_reps_added = round(added_reps_est/(tvap_remedy_precinct*(1-partisan_remedy)), 2),
         partisan_enacted = round(partisan_enacted, 3),
         partisan_remedy = round(partisan_remedy,3),
         pct_mvap_enacted = round(pct_mvap_enacted,3),
         `Pop deviation from ideal` = pop_remedy - ideal_pop,
         `Pct pop deviation from ideal` = round(`Pop deviation from ideal`/ideal_pop, 3),
          `BVAP Pct pt change` = pct_bvap_remedy - pct_bvap_enacted,
         `Gained / Lost BVAP district?` = case_when(pct_bvap_enacted >= .5 & pct_bvap_remedy < .5 ~ "Lost BVAP Majority",
                                                    pct_bvap_enacted < .5 & pct_bvap_remedy >= .5 ~ "Gained BVAP Majority",
                                                    pct_bvap_enacted >= .37 & pct_bvap_enacted < .5 & (pct_bvap_remedy >= .5 | pct_bvap_remedy < .37) ~ "Lost BVAP Influence",
                                                    (pct_bvap_enacted < .37 | pct_bvap_enacted >= .5) & (pct_bvap_remedy < .5 & pct_bvap_remedy >= .37) ~ "Gained BVAP Influence",
                                                    TRUE ~ ""),
         `Partisan lean change` = partisan_remedy - partisan_enacted,
         `Partisan flip?` = case_when(partisan_enacted >= .5 & partisan_remedy < .5 ~ "Lost Dem",
                                      partisan_enacted < .5 & partisan_remedy >= .5 ~ "Gained Dem",
                                                    TRUE ~ ""),
         `MVAP Pct pt change` = pct_mvap_remedy - pct_mvap_enacted,
         `Gained / Lost MVAP district?` = case_when(pct_mvap_enacted >= .5 & pct_mvap_remedy < .5 ~ "Lost MVAP Majority",
                                                    pct_mvap_enacted < .5 & pct_mvap_remedy >= .5 ~ "Gained MVAP Majority",
                                                    pct_mvap_enacted >= .37 & pct_mvap_enacted < .5 & (pct_mvap_remedy >= .5 | pct_mvap_remedy < .37) ~ "Lost MVAP Influence",
                                                    (pct_mvap_enacted < .37 | pct_mvap_enacted >= .5) & (pct_mvap_remedy < .5 & pct_mvap_remedy >= .37) ~ "Gained MVAP Influence",
                                                    TRUE ~ "")) |>
  select(district, pop_remedy, `Pop deviation from ideal`, `Pct pop deviation from ideal`,
         tvap_remedy, pct_bvap_remedy, pct_bvap_enacted, `BVAP Pct pt change`, `Gained / Lost BVAP district?`,
         partisan_remedy, partisan_enacted, `Partisan lean change`, `Partisan flip?`,
         pct_mvap_remedy, pct_mvap_enacted, `MVAP Pct pt change`, `Gained / Lost MVAP district?`,
         pct_pop_removed:pct_reps_added,
         removed_dems_est:added_tvap, everything())

write_csv(remedy_analysis, paste0("data/processed/", dtype, "/", dtype, "_difference_report.csv"))


#### Format for FDGA
remedy_difference_report <- remedy_analysis |> 
  select(district:added_reps_est, removed_pop:added_tvap, pct_mvap_remedy, pct_mvap_enacted, 
         pct_avap_al_remedy, pct_avp_enacted, pct_hvap_remedy, pct_hvp_enacted) |> 
  rename(pct_avap_remedy = pct_avap_al_remedy, 
         pct_avap_enacted = pct_avp_enacted, 
         pct_hvap_enacted = pct_hvp_enacted,
         partisan_lean_remedy = partisan_remedy,
         partisan_lean_enacted = partisan_enacted,
         pct_dems_removed_estimate = pct_dems_removed,
         pct_reps_removed_estimate = pct_reps_removed) |> 
  mutate(partisan_lean_remedy = round(partisan_lean_remedy, 3),
         partisan_lean_enacted = round(partisan_lean_enacted, 3))

write.xlsx(remedy_difference_report, paste0("assessment/", dtype, "/", dtype, "_difference_report.xlsx"))

#### adjust district summary to add difference variables

summary <- read.xlsx(summary_table_filepath)

changed_districts <- count(remedy_analysis |> filter(pct_pop_added > 0))
pct_pop_moved <- round(sum(remedy_analysis$removed_pop)/sum(remedy_analysis$pop_enacted), 3)

changed_districts_summary <- changed_districts |> 
  mutate(Type = "Number of Changed Distircts") |> 
  rename(Districts = n) |> 
  select(Type, Districts) |> 
  rbind(c("Percent of population moved", pct_pop_moved)) |> 
  rbind(summary)

### OVERWRITE the table to share
# write.xlsx(changed_districts_summary, summary_table_filepath)



######### Create Maps

## extra data to add to maps:

## create a shape that is just the areas that have changed
changed_areas <- precinct_shp_change |>
  group_by(changed, proposed) |>
  summarise() |>
  filter(changed == "different")

### shape of unchanged districts
unchanged_districts_df <- remedy_analysis |> 
  filter(pct_pop_removed == 0) |> 
  mutate(district = as.character(district))

unchanged_districts <- remedy |> 
  right_join(unchanged_districts_df, by = c("proposed" = "district" ))


### import census blocks
census_block_raw <- st_read("geo/processed/vap_2020_block_30pct_data.geojson")

census_block <- census_block_raw |> 
  mutate(pct_bvap_ap = ifelse(total == 0, NA, pct_bvap_ap),
         pct_avap_ap = ifelse(total == 0, NA, pct_avap_ap),
         pct_mvap = ifelse(total == 0, NA, pct_mvap),
         pct_hvap = ifelse(total == 0, NA, pct_hvap))

# bvap_colors <- c('#e7e1ef', '#d4b9da', '#8c6bb1', '#88419d')
# mvap_colors <- c('#feebe2', '#fbb4b9', '#f768a1', '#ae017e')
# avap_colors <- c('#edf8e9', '#bae4b3', '#74c476', '#238b45')
# hvap_colors <- c('#ffffd4', '#fed98e', '#fe9929', '#cc4c02')
bvap_colors <- c('#ecdcf0', '#d1acdc', '#b77bc9', '#9c56b0', '#733785')
mvap_colors <- c('#feebe2', '#fbb4b9', '#ff8a9d', '#f768a1', '#ae017e')
avap_colors <- c('#edf8e9', '#bae4b3', '#92d194', '#74c476', '#238b45')
hvap_colors <- c('#ffffd4', '#fed98e', '#fcc047', '#fe9929', '#cc4c02')
partisan_colors <- c('#bc131e', '#eb4956', '#c36e9e', '#7279db', '#3c6ebf', '#1f4bae')

block_bvap <- ggplot()  + 
  geom_sf(data = census_block, 
          mapping = aes(fill = pct_bvap_ap), 
          lwd = 0) +
  theme_void() +
  scale_fill_stepsn(breaks=c(0, .25, .37, .5, .75, 1),
                       colors = bvap_colors,
                       na.value = "#c4c4c4",
                       name="Percent Black Voting Age Population (%)",
                       labels=percent_format(accuracy = 1L))  + 
  geom_sf(data = enacted,
          color = "#ab0202", fill = NA, lwd = .5) +
  geom_sf(data = remedy, 
          color = "#000000", fill = NA, lwd = .5) 

# block_bvap

precinct_partisan <- ggplot()  + 
  geom_sf(data = precinct_shp_change, 
          mapping = aes(fill = partisan), 
          lwd = 0) +
  theme_void() +
  scale_fill_stepsn(breaks=c(0, .4, .465, .5, .535, .6, 1),
                    colors = partisan_colors,
                    name="Percent Black Voting Age Population (%)",
                    labels=percent_format(accuracy = 1L))  + 
  geom_sf(data = enacted,
          color = "#126e00", fill = NA, lwd = .5) +
  geom_sf(data = remedy, 
          color = "#000000", fill = NA, lwd = .5)

# enacted & remedy
num_colors <- length(unique(enacted$enacted))
random_colors <- sample(colors(), num_colors)

enacted_colors <- enacted |> 
  arrange(enacted) |> 
  cbind(random_colors)


enacted_map <- ggplot() +
  geom_sf(data = enacted_colors,
          aes(fill = factor(random_colors)),
          show.legend = FALSE) +  # Use factor to treat 'enacted' as a discrete variable
  scale_fill_manual(values = random_colors) +
  theme_void() +
  geom_sf_text(data = enacted_colors,
               aes(label = as.character(enacted)),
               color = "#000000",
               size = fontsize,
               fontface = "bold") +
  labs(title = "US Congress, Enacted")

remedy_colors <- remedy |> 
  arrange(as.numeric(proposed)) |> 
  cbind(random_colors)


remedy_map <- ggplot() +
  geom_sf(data = remedy_colors,
          aes(fill = factor(random_colors)),
          show.legend = FALSE) +  # Use factor to treat 'enacted' as a discrete variable
  scale_fill_manual(values = random_colors) +
  theme_void() +
  geom_sf_text(data = remedy_colors,
               aes(label = as.character(proposed)),
               color = "#000000",
               size = fontsize,
               fontface = "bold") +
  labs(title = "US Congress, Cooper Illustrative Map")

##### High res map
remedy_map_high_res <- ggplot() +
  geom_sf(data = remedy_colors,
          aes(fill = factor(random_colors)),
          lwd = .5,
          show.legend = FALSE) +  # Use factor to treat 'enacted' as a discrete variable
  scale_fill_manual(values = random_colors) +
  theme_void() +
  geom_sf_text(data = remedy_colors,
               aes(label = as.character(proposed)),
               color = "#000000",
               size = highres_fontsize,
               fontface = "bold") +
  labs(title = "US Congress, Cooper Illustrative Map")

remedy_map_high_res_atl_macon <- ggplot() +
  geom_sf(data = remedy_colors,
          aes(fill = factor(random_colors)),
          lwd = .5,
          show.legend = FALSE) +  # Use factor to treat 'enacted' as a discrete variable
  scale_fill_manual(values = random_colors) +
  theme_void() +
  geom_sf(data = atl, fill = "#7e0821", alpha = .2, color = "#7e0821", linetype = "dashed", lwd=.5) +
  geom_sf(data = macon, fill = "#7e0821", alpha = .2, color = "#7e0821", linetype = "dashed", lwd=.5) +
  geom_sf_text(data = remedy_colors,
               aes(label = as.character(proposed)),
               color = "#000000",
               size = highres_fontsize,
               fontface = "bold") +
  labs(title = "US Congress, Cooper Illustrative Map")


remedy_map_changed_districts <- ggplot() +
  geom_sf(data = remedy_colors,
          aes(fill = factor(random_colors)),
          show.legend = FALSE) +  # Use factor to treat 'enacted' as a discrete variable
  scale_fill_manual(values = random_colors_plus) +
  theme_void() +
  geom_sf(data = unchanged_districts, fill = "#fdf8eb", color = "#f6db9d") +
  geom_sf_text(data = remedy_colors,
               aes(label = as.character(proposed)),
               color = "#000000",
               size = 4,
               fontface = "bold") +
  labs(title = "US Congress, Cooper Illustrative Map")


# precinct_partisan

changes <- ggplot()  + 
  geom_sf(data = changed_areas, fill = "#5bbcc7") +
  theme_void() +
  geom_sf(data = enacted,
          color = "#ab0202", fill = NA, lwd = .5) +
  geom_sf(data = remedy, 
          color = "#000000", fill = NA, lwd = .5) 

changes_w_label <- ggplot()  + 
  geom_sf(data = changed_areas, fill = "#5bbcc7") +
  theme_void() +
  geom_sf(data = enacted,
          color = "#ab0202", fill = NA, lwd = .5) +
  geom_sf(data = remedy, 
          color = "#000000", fill = NA, lwd = 1) + 
  geom_sf_text(data = remedy, 
                aes(label = proposed), 
                color = "#000000", 
                size = 4,
                fontface = "bold") 


changes_w_enacted_label <- ggplot()  + 
  geom_sf(data = changed_areas, fill = "#5bbcc7") +
  theme_void() +
  geom_sf(data = remedy, 
          color = "#000000", fill = NA, lwd = .5) + 
  geom_sf(data = enacted,
          color = "#ab0202", fill = NA, lwd = 1) +
  geom_sf_text(data = enacted, 
               aes(label = enacted), 
               color = "#ab0202", 
               size = 4,
               fontface = "bold") 


ggsave(paste0(out_mappath, dtype, "_remedy_map_changes_block_bvap.png"), 
       plot = block_bvap, # specify the ggplot object you stored
       units = "in",
       height = 10, width = 10)

ggsave(paste0(out_mappath, dtype, "_remedy_map_changes_precinct_partisan.png"), 
       plot = precinct_partisan, # specify the ggplot object you stored
       units = "in",
       height = 10, width = 10)

ggsave(paste0(out_mappath, dtype, "_remedy_map_changed_areas.png"), 
       plot = changes, # specify the ggplot object you stored
       units = "in",
       height = 10, width = 10)

ggsave(paste0(out_mappath, dtype, "_remedy_map_changed_areas_with_remedy_labels.png"), 
       plot = changes_w_label, # specify the ggplot object you stored
       units = "in",
       dpi = "print",
       height = 15, width = 15)

ggsave(paste0(out_mappath, dtype, "_remedy_map_changed_areas_with_enacted_labels.png"), 
       plot = changes_w_enacted_label, # specify the ggplot object you stored
       units = "in",
       dpi = "print",
       height = 15, width = 15)

ggsave(paste0(out_mappath, dtype, "_remedy_map_changed_areas_only.png"), 
       plot = remedy_map_changed_districts, # specify the ggplot object you stored
       units = "in",
       height = 10, width = 10)

ggsave(paste0(out_filepath_legend, dtype, "_labelled_remedy_map.png"), 
       plot = remedy_map, # specify the ggplot object you stored
       units = "in",
       height = 10, width = 10)

ggsave(paste0(out_filepath_legend, dtype, "_labelled_enacted_map.png"), 
       plot = enacted_map, # specify the ggplot object you stored
       units = "in",
       dpi = "print",
       height = 10, width = 10)

ggsave(paste0(out_filepath, dtype, "_labelled_remedy_map.png"), 
       plot = remedy_map, # specify the ggplot object you stored
       units = "in",
       height = 10, width = 10)

ggsave(paste0(out_filepath, dtype, "_labelled_enacted_map.png"), 
       plot = enacted_map, # specify the ggplot object you stored
       units = "in",
       dpi = "print",
       height = 10, width = 10)

### High res maps to zoom in

ggsave(paste0(out_filepath_legend, dtype, "_labelled_remedy_map_high_res.png"), 
       plot = remedy_map_high_res, # specify the ggplot object you stored
       units = "in",
       dpi = 300,
       height = 30, width = 30)

ggsave(paste0(out_filepath_legend, dtype, "_labelled_remedy_map_high_res_with_atlanta_macon.png"), 
       plot = remedy_map_high_res_atl_macon, # specify the ggplot object you stored
       units = "in",
       dpi = 300,
       height = 30, width = 30)


