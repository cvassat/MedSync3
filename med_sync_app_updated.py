
import streamlit as st
from datetime import datetime, timedelta

def calculate_sync_quantities(current_meds, new_med, sync_date):
    results = []
    sync_date = datetime.strptime(sync_date, "%Y-%m-%d")
    today = datetime.today()
    days_until_sync = (sync_date - today).days

    if days_until_sync < 0:
        st.error("Sync date must be in the future")
        return []

    # Process existing meds
    for med in current_meds:
        days_left = med['remaining'] // med['daily_dose']
        additional_days_needed = days_until_sync - days_left
        units_needed = max(additional_days_needed * med['daily_dose'], 0)
        results.append({
            'name': med['name'],
            'days_left': days_left,
            'units_needed': units_needed
        })

    # Process new med
    new_med_units = new_med['daily_dose'] * days_until_sync
    results.append({
        'name': new_med['name'] + " (new)",
        'days_left': 0,
        'units_needed': new_med_units
    })

    return results

st.title("Medication Sync Calculator")
st.write("Calculate how many units are needed to align all medications, including a new one, to the same refill date.")

with st.form("med_form"):
    num_meds = st.number_input("Number of existing medications", min_value=0, max_value=10, step=1)
    meds = []
    for i in range(num_meds):
        name = st.text_input(f"Medication {i+1} Name", key=f"name_{i}")
        daily_dose = st.number_input(f"Daily Dose for Medication {i+1}", min_value=1, key=f"dose_{i}")
        remaining = st.number_input(f"Units Remaining for Medication {i+1}", min_value=0, key=f"remaining_{i}")
        meds.append({'name': name, 'daily_dose': daily_dose, 'remaining': remaining})

    st.markdown("### New Medication Details")
    new_name = st.text_input("New Medication Name", key="new_name")
    new_dose = st.number_input("New Medication Daily Dose", min_value=1, key="new_dose")
    new_med = {'name': new_name, 'daily_dose': new_dose}

    sync_date = st.date_input("Desired Sync Date")
    submitted = st.form_submit_button("Calculate")

if submitted:
    result = calculate_sync_quantities(meds, new_med, sync_date.strftime("%Y-%m-%d"))
    if result:
        st.subheader("Sync Plan")
        for med in result:
            st.write(f"**{med['name']}**: {med['units_needed']} units needed to sync by {sync_date}")
