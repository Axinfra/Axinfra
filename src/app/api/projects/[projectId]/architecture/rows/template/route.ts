import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';

// Standard 86-drawing list from Urbanscape PMC Division
const STANDARD_DRAWINGS = [
  // PLANS
  { s: 1,  cat: 'PLANS',                                  name: 'FURNITURE LAYOUT – BASEMENT FLOOR',                                   floor: 'BASEMENT'      },
  { s: 2,  cat: 'PLANS',                                  name: 'FURNITURE LAYOUT – GROUND FLOOR',                                     floor: 'GROUND_FLOOR'  },
  { s: 3,  cat: 'PLANS',                                  name: 'FURNITURE LAYOUT – FIRST FLOOR',                                      floor: 'FIRST_FLOOR'   },
  { s: 4,  cat: 'PLANS',                                  name: 'FURNITURE LAYOUT – SECOND FLOOR',                                     floor: 'SECOND_FLOOR'  },
  { s: 5,  cat: 'PLANS',                                  name: 'FURNITURE LAYOUT – TERRACE FLOOR',                                    floor: 'TERRACE'       },
  // SET-OUT PLANS
  { s: 6,  cat: 'SET-OUT PLANS',                          name: 'COLUMN SET-OUT',                                                      floor: 'ALL_FLOORS'    },
  { s: 7,  cat: 'SET-OUT PLANS',                          name: 'BRICKWORK LAYOUT – BASEMENT FLOOR',                                   floor: 'BASEMENT'      },
  { s: 8,  cat: 'SET-OUT PLANS',                          name: 'BRICKWORK LAYOUT – GROUND FLOOR',                                     floor: 'GROUND_FLOOR'  },
  { s: 9,  cat: 'SET-OUT PLANS',                          name: 'BRICKWORK LAYOUT – FIRST FLOOR',                                      floor: 'FIRST_FLOOR'   },
  { s: 10, cat: 'SET-OUT PLANS',                          name: 'BRICKWORK LAYOUT – SECOND FLOOR',                                     floor: 'SECOND_FLOOR'  },
  { s: 11, cat: 'SET-OUT PLANS',                          name: 'BRICKWORK LAYOUT – TERRACE FLOOR',                                    floor: 'TERRACE'       },
  { s: 12, cat: 'SET-OUT PLANS',                          name: 'BRICKWORK LAYOUT – DETAILS',                                          floor: 'ALL_FLOORS'    },
  { s: 13, cat: 'SET-OUT PLANS',                          name: 'BRICKWORK LAYOUT – DOOR WINDOW SCHEDULE',                             floor: 'ALL_FLOORS'    },
  { s: 14, cat: 'SET-OUT PLANS',                          name: 'PARTITION LAYOUT – BASEMENT FLOOR',                                   floor: 'BASEMENT'      },
  { s: 15, cat: 'SET-OUT PLANS',                          name: 'PARTITION LAYOUT – GROUND FLOOR',                                     floor: 'GROUND_FLOOR'  },
  { s: 16, cat: 'SET-OUT PLANS',                          name: 'PARTITION LAYOUT – FIRST FLOOR',                                      floor: 'FIRST_FLOOR'   },
  { s: 17, cat: 'TYPICAL DETAILS',                        name: 'STANDARD DETAILS FOR THE ENTIRE PROJECT',                             floor: 'ALL_FLOORS'    },
  // HVAC
  { s: 18, cat: 'HVAC PLANS',                             name: 'BASEMENT FLOOR HVAC LAYOUT',                                         floor: 'BASEMENT'      },
  { s: 19, cat: 'HVAC PLANS',                             name: 'GROUND FLOOR HVAC LAYOUT',                                           floor: 'GROUND_FLOOR'  },
  { s: 20, cat: 'HVAC PLANS',                             name: 'FIRST FLOOR HVAC LAYOUT',                                            floor: 'FIRST_FLOOR'   },
  { s: 21, cat: 'HVAC PLANS',                             name: 'SECOND FLOOR HVAC LAYOUT',                                           floor: 'SECOND_FLOOR'  },
  { s: 22, cat: 'HVAC PLANS',                             name: 'TERRACE FLOOR HVAC LAYOUT',                                          floor: 'TERRACE'       },
  // PLUMBING
  { s: 23, cat: 'PLUMBING',                               name: 'BASEMENT FLOOR PLUMBING LAYOUT',                                     floor: 'BASEMENT'      },
  { s: 24, cat: 'PLUMBING',                               name: 'GROUND FLOOR PLUMBING LAYOUT',                                       floor: 'GROUND_FLOOR'  },
  { s: 25, cat: 'PLUMBING',                               name: 'FIRST FLOOR PLUMBING LAYOUT',                                        floor: 'FIRST_FLOOR'   },
  { s: 26, cat: 'PLUMBING',                               name: 'SECOND FLOOR PLUMBING LAYOUT',                                       floor: 'SECOND_FLOOR'  },
  { s: 27, cat: 'PLUMBING',                               name: 'TERRACE FLOOR PLUMBING LAYOUT',                                      floor: 'TERRACE'       },
  { s: 28, cat: 'PLUMBING',                               name: 'NOTES, LEGENDS AND ABBREVIATIONS',                                   floor: 'ALL_FLOORS'    },
  // ELECTRICAL
  { s: 29, cat: 'ELECTRICAL',                             name: 'BASEMENT FLOOR – POWER AND ELV',                                     floor: 'BASEMENT'      },
  { s: 30, cat: 'ELECTRICAL',                             name: 'GROUND FLOOR – POWER AND ELV',                                       floor: 'GROUND_FLOOR'  },
  { s: 31, cat: 'ELECTRICAL',                             name: 'FIRST FLOOR – LIGHTING, POWER & LV',                                 floor: 'FIRST_FLOOR'   },
  { s: 32, cat: 'ELECTRICAL',                             name: 'SECOND FLOOR – LIGHTING, POWER & LV',                                floor: 'SECOND_FLOOR'  },
  { s: 33, cat: 'ELECTRICAL',                             name: 'TERRACE FLOOR – LIGHTING, POWER & LV',                               floor: 'TERRACE'       },
  { s: 34, cat: 'ELECTRICAL',                             name: 'SINGLE LINE DIAGRAM',                                                floor: 'ALL_FLOORS'    },
  { s: 35, cat: 'ELECTRICAL',                             name: 'DB DETAILS',                                                         floor: 'ALL_FLOORS'    },
  { s: 36, cat: 'ELECTRICAL',                             name: 'TYPICAL DETAILS',                                                    floor: 'ALL_FLOORS'    },
  { s: 37, cat: 'EXTERNAL DOOR & WINDOW DETAILS',         name: 'DOOR WINDOW SCHEDULE',                                              floor: 'ALL_FLOORS'    },
  { s: 38, cat: 'KITCHEN',                                name: 'KITCHEN LAYOUT & ELEVATION WITH ELECTRICAL, PLUMBING & TILE DETAILS', floor: 'ALL_FLOORS'    },
  { s: 39, cat: 'LIFT',                                   name: 'LIFT GA DRAWINGS',                                                   floor: 'ALL_FLOORS'    },
  // FLOORING PROFILE PLANS
  { s: 40, cat: 'FLOORING PROFILE PLANS',                 name: 'BASEMENT FLOOR FLOORING PLAN PROFILE',                              floor: 'BASEMENT'      },
  { s: 41, cat: 'FLOORING PROFILE PLANS',                 name: 'GROUND FLOOR FLOORING PLAN PROFILE',                                floor: 'GROUND_FLOOR'  },
  { s: 42, cat: 'FLOORING PROFILE PLANS',                 name: 'FIRST FLOOR FLOORING PLAN PROFILE',                                 floor: 'FIRST_FLOOR'   },
  { s: 43, cat: 'FLOORING PROFILE PLANS',                 name: 'SECOND FLOOR FLOORING PLAN PROFILE',                                floor: 'SECOND_FLOOR'  },
  // REFLECTIVE CEILING
  { s: 44, cat: 'REFLECTIVE CEILING PLANS & DETAILS',     name: 'RCP & DETAILS – BASEMENT FLOOR',                                    floor: 'BASEMENT'      },
  { s: 45, cat: 'REFLECTIVE CEILING PLANS & DETAILS',     name: 'RCP & DETAILS – GROUND FLOOR',                                      floor: 'GROUND_FLOOR'  },
  { s: 46, cat: 'REFLECTIVE CEILING PLANS & DETAILS',     name: 'RCP & DETAILS – FIRST FLOOR',                                       floor: 'FIRST_FLOOR'   },
  { s: 47, cat: 'REFLECTIVE CEILING PLANS & DETAILS',     name: 'RCP & DETAILS – SECOND FLOOR',                                      floor: 'SECOND_FLOOR'  },
  { s: 48, cat: 'REFLECTIVE CEILING PLANS & DETAILS',     name: 'RCP & DETAILS – TERRACE FLOOR',                                     floor: 'TERRACE'       },
  { s: 49, cat: 'REFLECTIVE CEILING PLANS & DETAILS',     name: 'RCP & DETAILS – FLOOR HEIGHTS',                                     floor: 'ALL_FLOORS'    },
  // FLOORING PLANS
  { s: 50, cat: 'FLOORING PLANS',                         name: 'FLOORING PLAN – BASEMENT FLOOR',                                    floor: 'BASEMENT'      },
  { s: 51, cat: 'FLOORING PLANS',                         name: 'FLOORING PLAN – GROUND FLOOR',                                      floor: 'GROUND_FLOOR'  },
  { s: 52, cat: 'FLOORING PLANS',                         name: 'FLOORING PLAN – FIRST FLOOR',                                       floor: 'FIRST_FLOOR'   },
  { s: 53, cat: 'FLOORING PLANS',                         name: 'FLOORING PLAN – SECOND FLOOR',                                      floor: 'SECOND_FLOOR'  },
  { s: 54, cat: 'FLOORING PLANS',                         name: 'FLOORING PLAN – TERRACE FLOOR',                                     floor: 'TERRACE'       },
  // DRY PARTITION
  { s: 55, cat: 'DRY PARTITION & WOODEN CEILING DETAILS', name: 'DRY PARTITION & WOODEN CEILING DETAILS OF BASEMENT FLOOR',          floor: 'BASEMENT'      },
  { s: 56, cat: 'DRY PARTITION & WOODEN CEILING DETAILS', name: 'DRY PARTITION & WOODEN CEILING DETAILS OF GROUND FLOOR',            floor: 'GROUND_FLOOR'  },
  { s: 57, cat: 'DRY PARTITION & WOODEN CEILING DETAILS', name: 'DRY PARTITION & WOODEN CEILING DETAILS OF FIRST FLOOR',             floor: 'FIRST_FLOOR'   },
  { s: 58, cat: 'DRY PARTITION & WOODEN CEILING DETAILS', name: 'DRY PARTITION & WOODEN CEILING DETAILS OF SECOND FLOOR',            floor: 'SECOND_FLOOR'  },
  // INTERNAL WALL ELEVATIONS
  { s: 59, cat: 'INTERNAL WALL ELEVATIONS',               name: 'ROOM & COMMON AREA WALL ELEVATIONS OF BASEMENT FLOOR',              floor: 'BASEMENT'      },
  { s: 60, cat: 'INTERNAL WALL ELEVATIONS',               name: 'ROOM & COMMON AREA WALL ELEVATIONS OF GROUND FLOOR',                floor: 'GROUND_FLOOR'  },
  { s: 61, cat: 'INTERNAL WALL ELEVATIONS',               name: 'ROOM & COMMON AREA WALL ELEVATIONS OF FIRST FLOOR',                 floor: 'FIRST_FLOOR'   },
  { s: 62, cat: 'INTERNAL WALL ELEVATIONS',               name: 'ROOM & COMMON AREA WALL ELEVATIONS OF SECOND FLOOR',                floor: 'SECOND_FLOOR'  },
  // WARDROBE & DOOR
  { s: 63, cat: 'INTERNAL WARDROBE & DOOR DETAILS',       name: 'LAYOUT & ELEVATIONS OF INTERNAL WARDROBES FOR ALL FLOORS',          floor: 'ALL_FLOORS'    },
  { s: 64, cat: 'INTERNAL WARDROBE & DOOR DETAILS',       name: 'DETAILS OF DOOR & DOOR FRAME FOR ALL FLOORS',                       floor: 'ALL_FLOORS'    },
  { s: 65, cat: 'INTERNAL WARDROBE & DOOR DETAILS',       name: 'DETAILS OF MAIN DOOR & DOOR FRAME',                                 floor: 'ALL_FLOORS'    },
  // TOILETS
  { s: 66, cat: 'TOILETS',                                name: 'TOILET CENTER LINE – BASEMENT FLOOR',                               floor: 'BASEMENT'      },
  { s: 67, cat: 'TOILETS',                                name: 'TOILET CENTER LINE – GROUND FLOOR',                                 floor: 'GROUND_FLOOR'  },
  { s: 68, cat: 'TOILETS',                                name: 'TOILET CENTER LINE – FIRST FLOOR',                                  floor: 'FIRST_FLOOR'   },
  { s: 69, cat: 'TOILETS',                                name: 'TOILET CENTER LINE – SECOND FLOOR',                                 floor: 'SECOND_FLOOR'  },
  { s: 70, cat: 'TOILETS',                                name: 'BASEMENT FLOOR ALL TOILETS PLAN & ELEVATIONS',                      floor: 'BASEMENT'      },
  { s: 71, cat: 'TOILETS',                                name: 'GROUND FLOOR ALL TOILETS PLAN & ELEVATIONS',                        floor: 'GROUND_FLOOR'  },
  { s: 72, cat: 'TOILETS',                                name: 'FIRST FLOOR ALL TOILETS PLAN & ELEVATIONS',                         floor: 'FIRST_FLOOR'   },
  { s: 73, cat: 'TOILETS',                                name: 'SECOND FLOOR ALL TOILETS PLAN & ELEVATIONS',                        floor: 'SECOND_FLOOR'  },
  // STAIRCASE
  { s: 74, cat: 'STAIRCASE DETAILS',                      name: 'STAIRCASE PLAN',                                                    floor: 'ALL_FLOORS'    },
  { s: 75, cat: 'STAIRCASE DETAILS',                      name: 'STAIRCASE DETAIL',                                                  floor: 'ALL_FLOORS'    },
  { s: 76, cat: 'STAIRCASE DETAILS',                      name: 'STAIRCASE SECTION',                                                 floor: 'ALL_FLOORS'    },
  // BUILDING ELEVATION
  { s: 77, cat: 'BUILDING ELEVATION & SECTIONS',          name: 'ALL SIDES ELEVATION',                                               floor: 'ALL_FLOORS'    },
  { s: 78, cat: 'BUILDING ELEVATION & SECTIONS',          name: 'ALL SECTIONS & DETAILS',                                            floor: 'ALL_FLOORS'    },
  { s: 79, cat: 'BUILDING ELEVATION & SECTIONS',          name: 'STONE PATTERN ELEVATION',                                           floor: 'ALL_FLOORS'    },
  { s: 80, cat: 'BUILDING ELEVATION & SECTIONS',          name: 'ALL FLOORS PARAPET DETAILS',                                        floor: 'ALL_FLOORS'    },
  // EXTERNAL DEVELOPMENT
  { s: 81, cat: 'EXTERNAL DEVELOPMENT',                   name: 'BOUNDARY WALL DETAILS',                                             floor: 'ALL_FLOORS'    },
  { s: 82, cat: 'EXTERNAL DEVELOPMENT',                   name: 'DRIVEWAY DETAILS',                                                  floor: 'ALL_FLOORS'    },
  { s: 83, cat: 'EXTERNAL DEVELOPMENT',                   name: 'MS WORK DETAILS',                                                   floor: 'ALL_FLOORS'    },
  { s: 84, cat: 'EXTERNAL DEVELOPMENT',                   name: 'MAIN GATE DETAILS',                                                 floor: 'ALL_FLOORS'    },
  { s: 85, cat: 'EXTERNAL DEVELOPMENT',                   name: 'GUARD ROOM DETAILS',                                                floor: 'ALL_FLOORS'    },
  { s: 86, cat: 'EXTERNAL DEVELOPMENT',                   name: 'EXTERNAL SERVICES DETAILS',                                         floor: 'ALL_FLOORS'    },
];

// GET /api/projects/[projectId]/architecture/rows/template
// Returns an XLSX file with the standard drawing template pre-filled
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const XLSX = await import('xlsx');

    const header = ['S.No', 'Category', 'Drawing Name', 'Floor', 'Description (optional)'];
    const data = STANDARD_DRAWINGS.map((d) => [
      d.s,
      d.cat,
      d.name,
      d.floor,
      '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

    // Column widths
    ws['!cols'] = [
      { wch: 6 },
      { wch: 35 },
      { wch: 60 },
      { wch: 15 },
      { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Drawing List');

    // Notes sheet
    const notesData = [
      ['Floor values (use exactly as shown):'],
      ['BASEMENT', 'Basement floor'],
      ['GROUND_FLOOR', 'Ground floor'],
      ['FIRST_FLOOR', 'First floor'],
      ['SECOND_FLOOR', 'Second floor'],
      ['TERRACE', 'Terrace floor'],
      ['ALL_FLOORS', 'Applies to all floors / not floor-specific'],
      [''],
      ['Instructions:'],
      ['1. Do not delete the header row'],
      ['2. S.No will be auto-assigned — you can leave it or change it (for sorting only)'],
      ['3. Category and Drawing Name are required'],
      ['4. Floor must be one of the values above (or leave blank for ALL_FLOORS)'],
    ];
    const wsNotes = XLSX.utils.aoa_to_sheet(notesData);
    wsNotes['!cols'] = [{ wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsNotes, 'Instructions');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="drawing-list-template.xlsx"',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
