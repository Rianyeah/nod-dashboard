"""
Pydantic schemas for site data.
"""
from pydantic import BaseModel
from typing import Optional


class SiteMapFeature(BaseModel):
    """Site data for map marker rendering."""
    site_id: str
    site_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    kabupaten: Optional[str] = None
    site_class: Optional[str] = None
    status_site: Optional[str] = None
    nop: Optional[str] = None
    cluster: Optional[str] = None
    type_site: Optional[str] = None
    avg_availability: Optional[float] = None
    total_outage_menit: Optional[float] = None
    jumlah_cell: Optional[int] = None
    rca_dominan: Optional[str] = None


class SiteListItem(BaseModel):
    """Site summary for table display."""
    site_id: str
    site_name: Optional[str] = None
    kabupaten: Optional[str] = None
    site_class: Optional[str] = None
    status_site: Optional[str] = None
    nop: Optional[str] = None
    cluster: Optional[str] = None
    type_site: Optional[str] = None
    avg_availability: Optional[float] = None
    total_outage_menit: Optional[float] = None
    jumlah_cell: Optional[int] = None
    rca_dominan: Optional[str] = None


class SiteSearchResult(BaseModel):
    """Site search result item."""
    site_id: str
    site_name: Optional[str] = None
    kabupaten: Optional[str] = None
    site_class: Optional[str] = None
    status_site: Optional[str] = None


class SiteDetail(BaseModel):
    """Full site detail — all columns from data_site_master + availability."""
    # Identitas
    site_id: str
    site_name: Optional[str] = None
    status_site: Optional[str] = None
    site_class: Optional[str] = None
    nop: Optional[str] = None
    cluster: Optional[str] = None
    type_site: Optional[str] = None
    category_site: Optional[str] = None
    jenis_infra: Optional[str] = None
    oa_date: Optional[str] = None
    brand_type: Optional[str] = None
    tp: Optional[str] = None

    # Koordinat & Lokasi
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    kabupaten: Optional[str] = None
    kecamatan: Optional[str] = None
    desa: Optional[str] = None
    alamat: Optional[str] = None

    # Teknologi & Band
    band_ne: Optional[str] = None
    dcs1800: Optional[str] = None
    gsm900: Optional[str] = None
    l900: Optional[str] = None
    l1800: Optional[str] = None
    l2100: Optional[str] = None
    l2300: Optional[str] = None
    n2100: Optional[str] = None
    n2300: Optional[str] = None
    lte_nb_iot: Optional[str] = None
    transport_type: Optional[str] = None
    list_far_end: Optional[str] = None

    # Power & Infrastruktur
    backup_power_by: Optional[str] = None
    backup_time_battery: Optional[str] = None
    type_battery: Optional[str] = None
    tgl_install_battery: Optional[str] = None
    jumlah_battery: Optional[str] = None
    umur_battery: Optional[str] = None
    status_garansi_battery: Optional[str] = None
    jenis_rectifier: Optional[str] = None
    total_load_rectifier: Optional[str] = None
    jumlah_modul: Optional[str] = None
    id_pln: Optional[str] = None
    kap_pln: Optional[str] = None
    genset_fix: Optional[str] = None
    status_genset: Optional[str] = None
    kapasitas_genset: Optional[str] = None
    merk_genset: Optional[str] = None
    jalur_pemadaman: Optional[str] = None

    # Status Monitoring
    wdm_status: Optional[str] = None
    nms_recti_status: Optional[str] = None
    emu_status: Optional[str] = None
    enva_status: Optional[str] = None
    kriteria_pm_site: Optional[str] = None

    # Availability (from JOIN)
    avg_availability: Optional[float] = None
    total_outage_menit: Optional[float] = None
    jumlah_hari_data: Optional[int] = None
    jumlah_cell: Optional[int] = None
    rca_dominan: Optional[str] = None


class SiteFilterOptions(BaseModel):
    """Available filter dropdown options."""
    kabupaten: list[str] = []
    cluster: list[str] = []
    kelas: list[str] = []
    nop: list[str] = []


class SiteListResponse(BaseModel):
    """Paginated site list response."""
    data: list[SiteListItem] = []
    total: int = 0
    page: int = 1
    limit: int = 20
    total_pages: int = 0
