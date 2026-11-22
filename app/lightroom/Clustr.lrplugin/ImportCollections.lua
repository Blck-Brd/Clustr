-- Clustr Collections: reads clustr-manifest.json from a Clustr export and
-- rebuilds the same trip / stop structure as Lightroom Collection Sets and
-- Collections. Photos are matched by file name plus relative path, so it works
-- for raw files (XMP sidecars) as well as JPEG exports.
--
-- Re-running the menu item is safe: existing sets and collections are reused and
-- Lightroom ignores photos that are already in a collection.

local LrApplication = import 'LrApplication'
local LrDialogs = import 'LrDialogs'
local LrFileUtils = import 'LrFileUtils'
local LrProgressScope = import 'LrProgressScope'
local LrTasks = import 'LrTasks'

local MANIFEST_NAME = 'clustr-manifest.json'
local ALL_PHOTOS = 'All photos'

-- Minimal JSON decoder (Lua 5.1). The Lightroom SDK ships no JSON parser and we
-- want the plug-in to stay dependency free.
local Json = {}

local function skipWhitespace(text, index)
    while index <= #text do
        local char = text:sub(index, index)
        if char == ' ' or char == '\t' or char == '\r' or char == '\n' then
            index = index + 1
        else
            break
        end
    end
    return index
end

local function utf8Encode(code)
    if code < 0x80 then
        return string.char(code)
    elseif code < 0x800 then
        return string.char(0xC0 + math.floor(code / 0x40), 0x80 + code % 0x40)
    elseif code < 0x10000 then
        return string.char(
            0xE0 + math.floor(code / 0x1000),
            0x80 + math.floor(code / 0x40) % 0x40,
            0x80 + code % 0x40
        )
    end
    return string.char(
        0xF0 + math.floor(code / 0x40000),
        0x80 + math.floor(code / 0x1000) % 0x40,
        0x80 + math.floor(code / 0x40) % 0x40,
        0x80 + code % 0x40
    )
end

local function parseUnicodeEscape(text, index)
    local hex = text:sub(index, index + 3)
    local code = tonumber(hex, 16)
    if not code then
        return '?', index + 4
    end
    -- Combine a surrogate pair when the next escape is a low surrogate.
    if code >= 0xD800 and code <= 0xDBFF and text:sub(index + 4, index + 5) == '\\u' then
        local low = tonumber(text:sub(index + 6, index + 9), 16)
        if low and low >= 0xDC00 and low <= 0xDFFF then
            code = 0x10000 + (code - 0xD800) * 0x400 + (low - 0xDC00)
            return utf8Encode(code), index + 10
        end
    end
    return utf8Encode(code), index + 4
end

local function parseString(text, index)
    local parts = {}
    index = index + 1
    while index <= #text do
        local char = text:sub(index, index)
        if char == '"' then
            return table.concat(parts), index + 1
        elseif char == '\\' then
            local escaped = text:sub(index + 1, index + 1)
            if escaped == 'n' then
                parts[#parts + 1] = '\n'
                index = index + 2
            elseif escaped == 't' then
                parts[#parts + 1] = '\t'
                index = index + 2
            elseif escaped == 'r' then
                parts[#parts + 1] = '\r'
                index = index + 2
            elseif escaped == 'b' then
                parts[#parts + 1] = '\b'
                index = index + 2
            elseif escaped == 'f' then
                parts[#parts + 1] = '\f'
                index = index + 2
            elseif escaped == 'u' then
                local decoded
                decoded, index = parseUnicodeEscape(text, index + 2)
                parts[#parts + 1] = decoded
            else
                parts[#parts + 1] = escaped
                index = index + 2
            end
        else
            parts[#parts + 1] = char
            index = index + 1
        end
    end
    error('Unterminated string in manifest')
end

local parseValue

local function parseArray(text, index)
    local result = {}
    index = skipWhitespace(text, index + 1)
    if text:sub(index, index) == ']' then
        return result, index + 1
    end
    while index <= #text do
        local value
        value, index = parseValue(text, index)
        result[#result + 1] = value
        index = skipWhitespace(text, index)
        local char = text:sub(index, index)
        if char == ',' then
            index = skipWhitespace(text, index + 1)
        elseif char == ']' then
            return result, index + 1
        else
            error('Malformed array in manifest')
        end
    end
    error('Unterminated array in manifest')
end

local function parseObject(text, index)
    local result = {}
    index = skipWhitespace(text, index + 1)
    if text:sub(index, index) == '}' then
        return result, index + 1
    end
    while index <= #text do
        if text:sub(index, index) ~= '"' then
            error('Malformed object in manifest')
        end
        local key
        key, index = parseString(text, index)
        index = skipWhitespace(text, index)
        if text:sub(index, index) ~= ':' then
            error('Malformed object in manifest')
        end
        local value
        value, index = parseValue(text, skipWhitespace(text, index + 1))
        result[key] = value
        index = skipWhitespace(text, index)
        local char = text:sub(index, index)
        if char == ',' then
            index = skipWhitespace(text, index + 1)
        elseif char == '}' then
            return result, index + 1
        else
            error('Malformed object in manifest')
        end
    end
    error('Unterminated object in manifest')
end

parseValue = function(text, index)
    index = skipWhitespace(text, index)
    local char = text:sub(index, index)
    if char == '{' then
        return parseObject(text, index)
    elseif char == '[' then
        return parseArray(text, index)
    elseif char == '"' then
        return parseString(text, index)
    elseif text:sub(index, index + 3) == 'true' then
        return true, index + 4
    elseif text:sub(index, index + 4) == 'false' then
        return false, index + 5
    elseif text:sub(index, index + 3) == 'null' then
        return nil, index + 4
    end
    local numberText = text:match('^-?%d+%.?%d*[eE]?[-+]?%d*', index)
    if numberText and #numberText > 0 then
        return tonumber(numberText), index + #numberText
    end
    error('Unexpected token in manifest at byte ' .. tostring(index))
end

Json.decode = function(text)
    local value = parseValue(text, 1)
    return value
end

local function normalizePath(value)
    return (tostring(value or ''):gsub('\\', '/'):lower())
end

local function nameKey(value)
    return tostring(value or ''):lower()
end

local function findChildSet(catalog, parent, name)
    local siblings
    if parent then
        siblings = parent:getChildCollectionSets()
    else
        siblings = catalog:getChildCollectionSets()
    end
    local wanted = nameKey(name)
    for _, set in ipairs(siblings) do
        if nameKey(set:getName()) == wanted then
            return set
        end
    end
    return nil
end

local function findChildCollection(parent, name)
    local wanted = nameKey(name)
    for _, collection in ipairs(parent:getChildCollections()) do
        if nameKey(collection:getName()) == wanted then
            return collection
        end
    end
    return nil
end

local function indexPhotos(catalog)
    local byName = {}
    for _, photo in ipairs(catalog:getAllPhotos()) do
        local key = normalizePath(photo:getRawMetadata('fileName'))
        byName[key] = byName[key] or {}
        table.insert(byName[key], photo)
    end
    return byName
end

-- Prefer a name match whose catalog path ends with the exported relative path,
-- so a second import of the same folder does not steal photos from the first.
local function matchPhoto(byName, entry)
    if type(entry) ~= 'table' then
        return nil
    end
    local candidates = byName[normalizePath(entry.name)]
    if not candidates or #candidates == 0 then
        return nil
    end
    if #candidates == 1 then
        return candidates[1]
    end
    local relative = normalizePath(entry.path)
    if #relative > 0 then
        for _, photo in ipairs(candidates) do
            local full = normalizePath(photo:getRawMetadata('path'))
            if #full >= #relative and full:sub(-#relative) == relative then
                return photo
            end
        end
    end
    return candidates[1]
end

local function readManifest(path)
    local text = LrFileUtils.readFile(path)
    if not text then
        error('Could not read ' .. tostring(path))
    end
    local manifest = Json.decode(text)
    if type(manifest) ~= 'table' then
        error('Manifest is not valid JSON')
    end
    if manifest.schema ~= 'clustr.export/1' then
        error('This file is not a Clustr manifest (' .. tostring(manifest.schema) .. ')')
    end
    return manifest
end

local function describeMissing(names)
    local shown = {}
    for index = 1, math.min(#names, 5) do
        shown[#shown + 1] = names[index]
    end
    local text = table.concat(shown, ', ')
    if #names > 5 then
        text = text .. ', ...'
    end
    return text
end

LrTasks.startAsyncTask(function()
    local chosen = LrDialogs.runOpenPanel({
        prompt = 'Select ' .. MANIFEST_NAME,
        title = 'Clustr export manifest',
        fileTypes = { 'json' },
        allowsMultipleSelection = false
    })

    local manifestPath
    if type(chosen) == 'table' then
        manifestPath = chosen[1]
    elseif type(chosen) == 'string' then
        manifestPath = chosen
    end
    if not manifestPath then
        return
    end

    local ok, manifestOrError = pcall(readManifest, manifestPath)
    if not ok then
        LrDialogs.message('Clustr collections', tostring(manifestOrError), 'critical')
        return
    end
    local manifest = manifestOrError
    local rootName = manifest.root or 'Clustr'
    local catalog = LrApplication.activeCatalog()
    local progress = LrProgressScope({ title = 'Clustr: ' .. rootName })

    local stats = {
        collections = 0,
        sets = 0,
        matched = 0,
        missing = {}
    }

    catalog:withWriteAccessDo('Create Clustr collections', function()
        local byName = indexPhotos(catalog)
        progress:setPortionComplete(0.3)

        local rootSet = findChildSet(catalog, nil, rootName)
        if not rootSet then
            rootSet = catalog:createCollectionSet(rootName, nil)
            stats.sets = stats.sets + 1
        end

        for _, setPath in ipairs(manifest.sets or {}) do
            local parent = rootSet
            for _, segment in ipairs(setPath) do
                local child = findChildSet(catalog, parent, segment)
                if not child then
                    child = catalog:createCollectionSet(segment, parent)
                    stats.sets = stats.sets + 1
                end
                parent = child
            end
        end
        progress:setPortionComplete(0.4)

        for _, entry in ipairs(manifest.collections or {}) do
            local segments = entry.path or {}
            local leaf = segments[#segments]
            if leaf then
                local parent = rootSet
                for index = 1, #segments - 1 do
                    local child = findChildSet(catalog, parent, segments[index])
                    if not child then
                        child = catalog:createCollectionSet(segments[index], parent)
                        stats.sets = stats.sets + 1
                    end
                    parent = child
                end

                local collection = findChildCollection(parent, leaf)
                if not collection then
                    collection = catalog:createCollection(leaf, parent, false)
                    if collection then
                        stats.collections = stats.collections + 1
                    end
                end

                if collection then
                    local photos = {}
                    for _, fileEntry in ipairs(entry.photos or {}) do
                        local photo = matchPhoto(byName, fileEntry)
                        if photo then
                            photos[#photos + 1] = photo
                        else
                            stats.missing[#stats.missing + 1] = tostring(fileEntry.name or '?')
                        end
                    end
                    if #photos > 0 then
                        collection:addPhotos(photos)
                        stats.matched = stats.matched + #photos
                    end
                end
            end
        end
    end, { timeout = 120 })

    progress:done()

    local summary = string.format(
        '%s\n\n%d collection sets, %d collections, %d photos matched.',
        rootName, stats.sets, stats.collections, stats.matched
    )
    if #stats.missing > 0 then
        summary = summary .. string.format(
            '\n\n%d exported photos are not in this catalog: %s\nImport the export folder into Lightroom first, then run this again.',
            #stats.missing, describeMissing(stats.missing)
        )
    end
    LrDialogs.message('Clustr collections', summary, #stats.missing > 0 and 'warning' or 'info')
end)
