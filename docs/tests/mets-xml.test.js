/**
 * METS-XML Parser Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { metsXMLParser } from '../js/services/parsers/mets-xml.js';

// ---------------------------------------------------------------------------
// Sample XML fixtures
// ---------------------------------------------------------------------------

const MINIMAL_METS = `<?xml version="1.0" encoding="UTF-8"?>
<mets:mets xmlns:mets="http://www.loc.gov/METS/"
           xmlns:xlink="http://www.w3.org/1999/xlink">
  <mets:fileSec>
    <mets:fileGrp USE="DEFAULT">
      <mets:file ID="FILE_0001" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="img/page001.jpg"/>
      </mets:file>
    </mets:fileGrp>
  </mets:fileSec>
  <mets:structMap TYPE="PHYSICAL">
    <mets:div TYPE="physSequence">
      <mets:div TYPE="page" ORDER="1" ID="phys_0001">
        <mets:fptr FILEID="FILE_0001"/>
      </mets:div>
    </mets:div>
  </mets:structMap>
</mets:mets>`;

const FULL_METS = `<?xml version="1.0" encoding="UTF-8"?>
<mets:mets xmlns:mets="http://www.loc.gov/METS/"
           xmlns:mods="http://www.loc.gov/mods/v3"
           xmlns:xlink="http://www.w3.org/1999/xlink"
           xmlns:dv="http://dfg-viewer.de/"
           xmlns:exif="http://ns.adobe.com/exif/1.0/">
  <mets:dmdSec ID="dmd_0001">
    <mets:mdWrap MDTYPE="MODS">
      <mets:xmlData>
        <mods:mods>
          <mods:titleInfo>
            <mods:title>Kirchenbuch Teststadt 1650-1700</mods:title>
          </mods:titleInfo>
          <mods:name>
            <mods:displayForm>Pfarrer Johann Beispiel</mods:displayForm>
          </mods:name>
          <mods:language>
            <mods:languageTerm type="text">German</mods:languageTerm>
          </mods:language>
          <mods:originInfo>
            <mods:dateIssued>1650</mods:dateIssued>
          </mods:originInfo>
          <mods:identifier type="urn">urn:nbn:de:test-12345</mods:identifier>
        </mods:mods>
      </mets:xmlData>
    </mets:mdWrap>
  </mets:dmdSec>
  <mets:amdSec>
    <mets:rightsMD>
      <mets:mdWrap MDTYPE="OTHER">
        <mets:xmlData>
          <dv:rights>
            <dv:owner>Stadtarchiv Teststadt</dv:owner>
          </dv:rights>
        </mets:xmlData>
      </mets:mdWrap>
    </mets:rightsMD>
  </mets:amdSec>
  <mets:fileSec>
    <mets:fileGrp USE="DEFAULT">
      <mets:file ID="FILE_0001" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="images/page001.jpg"/>
      </mets:file>
      <mets:file ID="FILE_0002" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="images/page002.jpg"/>
      </mets:file>
      <mets:file ID="FILE_0003" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="images/page003.jpg"/>
      </mets:file>
    </mets:fileGrp>
    <mets:fileGrp USE="THUMBS">
      <mets:file ID="THUMB_0001" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="thumbs/page001_thumb.jpg"/>
      </mets:file>
      <mets:file ID="THUMB_0002" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="thumbs/page002_thumb.jpg"/>
      </mets:file>
    </mets:fileGrp>
  </mets:fileSec>
  <mets:structMap TYPE="PHYSICAL">
    <mets:div TYPE="physSequence">
      <mets:div TYPE="page" ORDER="1" ID="phys_0001" CONTENTIDS="urn:page:1">
        <mets:fptr FILEID="FILE_0001"/>
        <mets:fptr FILEID="THUMB_0001"/>
      </mets:div>
      <mets:div TYPE="page" ORDER="2" ID="phys_0002" CONTENTIDS="urn:page:2">
        <mets:fptr FILEID="FILE_0002"/>
        <mets:fptr FILEID="THUMB_0002"/>
      </mets:div>
      <mets:div TYPE="page" ORDER="3" ID="phys_0003">
        <mets:fptr FILEID="FILE_0003"/>
      </mets:div>
    </mets:div>
  </mets:structMap>
  <mets:structMap TYPE="LOGICAL">
    <mets:div TYPE="manuscript" ID="log_0001" LABEL="Kirchenbuch">
      <mets:div TYPE="chapter" ID="log_0002" LABEL="Taufen">
        <mets:div TYPE="section" ID="log_0003" LABEL="Jahr 1650"/>
        <mets:div TYPE="section" ID="log_0004" LABEL="Jahr 1651"/>
      </mets:div>
      <mets:div TYPE="chapter" ID="log_0005" LABEL="Hochzeiten"/>
    </mets:div>
  </mets:structMap>
</mets:mets>`;

// Non-namespaced METS (some tools export without namespace prefixes)
const NON_NAMESPACED_METS = `<?xml version="1.0" encoding="UTF-8"?>
<mets xmlns="http://www.loc.gov/METS/"
      xmlns:xlink="http://www.w3.org/1999/xlink">
  <fileSec>
    <fileGrp USE="DEFAULT">
      <file ID="F1" MIMETYPE="image/tiff">
        <FLocat LOCTYPE="URL" xlink:href="scan001.tif"/>
      </file>
    </fileGrp>
  </fileSec>
  <structMap TYPE="PHYSICAL">
    <div TYPE="physSequence">
      <div TYPE="page" ORDER="1" ID="p1">
        <fptr FILEID="F1"/>
      </div>
    </div>
  </structMap>
</mets>`;

const MULTI_ORDER_METS = `<?xml version="1.0" encoding="UTF-8"?>
<mets:mets xmlns:mets="http://www.loc.gov/METS/"
           xmlns:xlink="http://www.w3.org/1999/xlink">
  <mets:fileSec>
    <mets:fileGrp USE="DEFAULT">
      <mets:file ID="F_A" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="a.jpg"/>
      </mets:file>
      <mets:file ID="F_B" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="b.jpg"/>
      </mets:file>
      <mets:file ID="F_C" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="c.jpg"/>
      </mets:file>
    </mets:fileGrp>
  </mets:fileSec>
  <mets:structMap TYPE="PHYSICAL">
    <mets:div TYPE="physSequence">
      <mets:div TYPE="page" ORDER="3" ID="p3">
        <mets:fptr FILEID="F_C"/>
      </mets:div>
      <mets:div TYPE="page" ORDER="1" ID="p1">
        <mets:fptr FILEID="F_A"/>
      </mets:div>
      <mets:div TYPE="page" ORDER="2" ID="p2">
        <mets:fptr FILEID="F_B"/>
      </mets:div>
    </mets:div>
  </mets:structMap>
</mets:mets>`;

const ABSOLUTE_URL_METS = `<?xml version="1.0" encoding="UTF-8"?>
<mets:mets xmlns:mets="http://www.loc.gov/METS/"
           xmlns:xlink="http://www.w3.org/1999/xlink">
  <mets:fileSec>
    <mets:fileGrp USE="DEFAULT">
      <mets:file ID="F1" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="https://example.com/images/scan.jpg"/>
      </mets:file>
    </mets:fileGrp>
  </mets:fileSec>
  <mets:structMap TYPE="PHYSICAL">
    <mets:div TYPE="physSequence">
      <mets:div TYPE="page" ORDER="1" ID="p1">
        <mets:fptr FILEID="F1"/>
      </mets:div>
    </mets:div>
  </mets:structMap>
</mets:mets>`;

const NO_STRUCT_MAP_METS = `<?xml version="1.0" encoding="UTF-8"?>
<mets:mets xmlns:mets="http://www.loc.gov/METS/"
           xmlns:xlink="http://www.w3.org/1999/xlink">
  <mets:fileSec>
    <mets:fileGrp USE="DEFAULT">
      <mets:file ID="F1" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="img.jpg"/>
      </mets:file>
    </mets:fileGrp>
  </mets:fileSec>
</mets:mets>`;

const MASTER_USE_METS = `<?xml version="1.0" encoding="UTF-8"?>
<mets:mets xmlns:mets="http://www.loc.gov/METS/"
           xmlns:xlink="http://www.w3.org/1999/xlink">
  <mets:fileSec>
    <mets:fileGrp USE="MASTER">
      <mets:file ID="M1" MIMETYPE="image/tiff">
        <mets:FLocat LOCTYPE="URL" xlink:href="master/scan.tif"/>
      </mets:file>
    </mets:fileGrp>
    <mets:fileGrp USE="THUMBNAIL">
      <mets:file ID="T1" MIMETYPE="image/jpeg">
        <mets:FLocat LOCTYPE="URL" xlink:href="thumb/scan.jpg"/>
      </mets:file>
    </mets:fileGrp>
  </mets:fileSec>
  <mets:structMap TYPE="PHYSICAL">
    <mets:div TYPE="physSequence">
      <mets:div TYPE="page" ORDER="1" ID="p1">
        <mets:fptr FILEID="M1"/>
        <mets:fptr FILEID="T1"/>
      </mets:div>
    </mets:div>
  </mets:structMap>
</mets:mets>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetsXMLParser', () => {

    // ====================================================================
    // isMetsXML detection
    // ====================================================================
    describe('isMetsXML', () => {
        it('should detect mets:mets root element', () => {
            expect(metsXMLParser.isMetsXML('<mets:mets xmlns:mets="...">')).toBe(true);
        });

        it('should detect non-prefixed mets root element', () => {
            expect(metsXMLParser.isMetsXML('<mets xmlns="http://www.loc.gov/METS/">')).toBe(true);
        });

        it('should detect METS namespace declaration', () => {
            expect(metsXMLParser.isMetsXML('xmlns:mets="http://www.loc.gov/METS/"')).toBe(true);
        });

        it('should return false for PAGE-XML', () => {
            expect(metsXMLParser.isMetsXML('<PcGts xmlns="http://schema.primaresearch.org/PAGE">')).toBe(false);
        });

        it('should return false for random XML', () => {
            expect(metsXMLParser.isMetsXML('<root><child/></root>')).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(metsXMLParser.isMetsXML('')).toBe(false);
        });
    });

    // ====================================================================
    // parse() -- general
    // ====================================================================
    describe('parse', () => {
        it('should return object with metadata, files, pages, structure', () => {
            const result = metsXMLParser.parse(MINIMAL_METS);
            expect(result).toHaveProperty('metadata');
            expect(result).toHaveProperty('files');
            expect(result).toHaveProperty('pages');
            expect(result).toHaveProperty('structure');
        });

        it('should throw on invalid XML', () => {
            expect(() => metsXMLParser.parse('<not-xml<<>>>')).toThrow('Parse Error');
        });

        it('should handle empty fileSec gracefully', () => {
            const xml = `<?xml version="1.0"?>
                <mets:mets xmlns:mets="http://www.loc.gov/METS/">
                  <mets:fileSec></mets:fileSec>
                  <mets:structMap TYPE="PHYSICAL">
                    <mets:div TYPE="physSequence"></mets:div>
                  </mets:structMap>
                </mets:mets>`;
            const result = metsXMLParser.parse(xml);
            expect(result.pages).toEqual([]);
            expect(Object.keys(result.files)).toHaveLength(0);
        });
    });

    // ====================================================================
    // Metadata extraction
    // ====================================================================
    describe('metadata extraction', () => {
        it('should extract title from MODS', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.metadata.title).toBe('Kirchenbuch Teststadt 1650-1700');
        });

        it('should extract author/displayForm', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.metadata.author).toBe('Pfarrer Johann Beispiel');
        });

        it('should extract language', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.metadata.language).toBe('German');
        });

        it('should extract dateIssued', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.metadata.date).toBe('1650');
        });

        it('should extract URN identifier', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.metadata.identifier).toBe('urn:nbn:de:test-12345');
        });

        it('should extract rights owner', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.metadata.rights).toBe('Stadtarchiv Teststadt');
        });

        it('should return empty strings when no metadata present', () => {
            const result = metsXMLParser.parse(MINIMAL_METS);
            expect(result.metadata.title).toBe('');
            expect(result.metadata.author).toBe('');
            expect(result.metadata.language).toBe('');
            expect(result.metadata.date).toBe('');
            expect(result.metadata.identifier).toBe('');
            expect(result.metadata.rights).toBe('');
        });
    });

    // ====================================================================
    // File extraction
    // ====================================================================
    describe('file extraction', () => {
        it('should extract all file entries', () => {
            const result = metsXMLParser.parse(FULL_METS);
            const fileIds = Object.keys(result.files);
            expect(fileIds).toContain('FILE_0001');
            expect(fileIds).toContain('FILE_0002');
            expect(fileIds).toContain('FILE_0003');
            expect(fileIds).toContain('THUMB_0001');
            expect(fileIds).toContain('THUMB_0002');
        });

        it('should capture MIMETYPE', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.files['FILE_0001'].mimeType).toBe('image/jpeg');
        });

        it('should resolve relative hrefs', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.files['FILE_0001'].href).toBe('images/page001.jpg');
        });

        it('should resolve relative hrefs against baseUrl', () => {
            const result = metsXMLParser.parse(MINIMAL_METS, 'https://archive.org/iiif/');
            expect(result.files['FILE_0001'].href).toBe('https://archive.org/iiif/img/page001.jpg');
        });

        it('should keep absolute URLs unchanged', () => {
            const result = metsXMLParser.parse(ABSOLUTE_URL_METS);
            expect(result.pages[0].image).toBe('https://example.com/images/scan.jpg');
        });

        it('should set USE from parent fileGrp', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.files['FILE_0001'].use).toBe('DEFAULT');
            expect(result.files['THUMB_0001'].use).toBe('THUMBS');
        });

        it('should default MIMETYPE to image/jpeg when absent', () => {
            const xml = `<?xml version="1.0"?>
                <mets:mets xmlns:mets="http://www.loc.gov/METS/" xmlns:xlink="http://www.w3.org/1999/xlink">
                  <mets:fileSec>
                    <mets:fileGrp USE="DEFAULT">
                      <mets:file ID="F1">
                        <mets:FLocat LOCTYPE="URL" xlink:href="img.jpg"/>
                      </mets:file>
                    </mets:fileGrp>
                  </mets:fileSec>
                  <mets:structMap TYPE="PHYSICAL">
                    <mets:div TYPE="physSequence">
                      <mets:div TYPE="page" ORDER="1" ID="p1">
                        <mets:fptr FILEID="F1"/>
                      </mets:div>
                    </mets:div>
                  </mets:structMap>
                </mets:mets>`;
            const result = metsXMLParser.parse(xml);
            expect(result.files['F1'].mimeType).toBe('image/jpeg');
        });
    });

    // ====================================================================
    // Page extraction
    // ====================================================================
    describe('page extraction', () => {
        it('should extract correct number of pages', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.pages).toHaveLength(3);
        });

        it('should use ORDER attribute for page order', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.pages[0].order).toBe(1);
            expect(result.pages[1].order).toBe(2);
            expect(result.pages[2].order).toBe(3);
        });

        it('should sort pages by ORDER', () => {
            const result = metsXMLParser.parse(MULTI_ORDER_METS);
            expect(result.pages[0].id).toBe('p1');
            expect(result.pages[1].id).toBe('p2');
            expect(result.pages[2].id).toBe('p3');
        });

        it('should extract page ID', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.pages[0].id).toBe('phys_0001');
        });

        it('should extract CONTENTIDS', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.pages[0].contentIds).toBe('urn:page:1');
        });

        it('should set empty CONTENTIDS when absent', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.pages[2].contentIds).toBe('');
        });

        it('should link image from DEFAULT/MASTER fileGrp', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.pages[0].image).toBe('images/page001.jpg');
        });

        it('should link thumbnail from THUMBS fileGrp', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.pages[0].thumbnail).toBe('thumbs/page001_thumb.jpg');
        });

        it('should fall back to image URL when no thumbnail', () => {
            const result = metsXMLParser.parse(FULL_METS);
            // Page 3 has no thumb
            expect(result.pages[2].thumbnail).toBe(result.pages[2].image);
        });

        it('should recognize MASTER as image source', () => {
            const result = metsXMLParser.parse(MASTER_USE_METS);
            expect(result.pages[0].image).toBe('master/scan.tif');
        });

        it('should recognize THUMBNAIL as thumb source', () => {
            const result = metsXMLParser.parse(MASTER_USE_METS);
            expect(result.pages[0].thumbnail).toBe('thumb/scan.jpg');
        });

        it('should return empty array when no physical structMap', () => {
            const result = metsXMLParser.parse(NO_STRUCT_MAP_METS);
            expect(result.pages).toEqual([]);
        });

        it('should default ORDER to index+1 when ORDER attribute missing', () => {
            const xml = `<?xml version="1.0"?>
                <mets:mets xmlns:mets="http://www.loc.gov/METS/" xmlns:xlink="http://www.w3.org/1999/xlink">
                  <mets:fileSec>
                    <mets:fileGrp USE="DEFAULT">
                      <mets:file ID="F1" MIMETYPE="image/jpeg">
                        <mets:FLocat LOCTYPE="URL" xlink:href="a.jpg"/>
                      </mets:file>
                    </mets:fileGrp>
                  </mets:fileSec>
                  <mets:structMap TYPE="PHYSICAL">
                    <mets:div TYPE="physSequence">
                      <mets:div TYPE="page" ID="p1">
                        <mets:fptr FILEID="F1"/>
                      </mets:div>
                    </mets:div>
                  </mets:structMap>
                </mets:mets>`;
            const result = metsXMLParser.parse(xml);
            expect(result.pages[0].order).toBe(1);
        });

        it('should include mimeType on page objects', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.pages[0].mimeType).toBe('image/jpeg');
        });
    });

    // ====================================================================
    // Logical structure extraction
    // ====================================================================
    describe('structure extraction', () => {
        it('should extract top-level logical structure', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.structure).toHaveLength(1);
            expect(result.structure[0].type).toBe('manuscript');
        });

        it('should extract label from LABEL attribute', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.structure[0].label).toBe('Kirchenbuch');
        });

        it('should nest children correctly', () => {
            const result = metsXMLParser.parse(FULL_METS);
            const root = result.structure[0];
            expect(root.children).toHaveLength(2);
            expect(root.children[0].label).toBe('Taufen');
            expect(root.children[1].label).toBe('Hochzeiten');
        });

        it('should track nesting level', () => {
            const result = metsXMLParser.parse(FULL_METS);
            const root = result.structure[0];
            expect(root.level).toBe(0);
            expect(root.children[0].level).toBe(1);
            expect(root.children[0].children[0].level).toBe(2);
        });

        it('should extract IDs on structure items', () => {
            const result = metsXMLParser.parse(FULL_METS);
            expect(result.structure[0].id).toBe('log_0001');
            expect(result.structure[0].children[0].id).toBe('log_0002');
        });

        it('should fall back to TYPE as label when LABEL is absent', () => {
            const xml = `<?xml version="1.0"?>
                <mets:mets xmlns:mets="http://www.loc.gov/METS/">
                  <mets:structMap TYPE="LOGICAL">
                    <mets:div TYPE="volume" ID="l1"/>
                  </mets:structMap>
                </mets:mets>`;
            const result = metsXMLParser.parse(xml);
            expect(result.structure[0].label).toBe('volume');
        });

        it('should return empty array when no logical structMap', () => {
            const result = metsXMLParser.parse(MINIMAL_METS);
            expect(result.structure).toEqual([]);
        });
    });

    // ====================================================================
    // _resolveUrl
    // ====================================================================
    describe('_resolveUrl', () => {
        it('should return empty string for empty url', () => {
            expect(metsXMLParser._resolveUrl('', '')).toBe('');
        });

        it('should return absolute http URLs unchanged', () => {
            expect(metsXMLParser._resolveUrl('http://example.com/img.jpg', 'https://base.com/'))
                .toBe('http://example.com/img.jpg');
        });

        it('should return absolute https URLs unchanged', () => {
            expect(metsXMLParser._resolveUrl('https://example.com/img.jpg', ''))
                .toBe('https://example.com/img.jpg');
        });

        it('should resolve relative URL against base', () => {
            expect(metsXMLParser._resolveUrl('page1.jpg', 'https://archive.org/data/'))
                .toBe('https://archive.org/data/page1.jpg');
        });

        it('should return relative URL as-is when no base', () => {
            expect(metsXMLParser._resolveUrl('images/page1.jpg', ''))
                .toBe('images/page1.jpg');
        });
    });

    // ====================================================================
    // Non-namespaced METS
    // ====================================================================
    describe('non-namespaced METS', () => {
        it('should parse pages from non-prefixed elements', () => {
            const result = metsXMLParser.parse(NON_NAMESPACED_METS);
            expect(result.pages).toHaveLength(1);
            expect(result.pages[0].image).toBe('scan001.tif');
        });

        it('should extract files from non-prefixed elements', () => {
            const result = metsXMLParser.parse(NON_NAMESPACED_METS);
            expect(result.files['F1']).toBeDefined();
            expect(result.files['F1'].mimeType).toBe('image/tiff');
        });
    });
});
